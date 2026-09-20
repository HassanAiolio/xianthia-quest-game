import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react";
import type { Epilogue, GameDifficulty, GameSnapshot, GameState, LogMessage, Player, StatKey } from "@/types/game";
import { makeId } from "@/game/dice";
import { buyFromMerchant, sellToMerchant } from "@/game/economy";
import { toggleEquip } from "@/game/items";
import { loadSnapshot, newSnapshot, resumeState, saveSnapshot } from "@/game/save";
import { IN_GAME_STAT_CAP } from "@/game/stats";
import { applyTurn, type TurnResult } from "@/game/turn";

type Action =
  | { type: "SET_GAME_STATE"; value: GameState }
  | { type: "START_GAME"; player: Player; intro: LogMessage[]; difficulty: GameDifficulty }
  | { type: "RESUME" }
  | { type: "ADD_LOG"; value: LogMessage }
  | { type: "DISCARD_LOG"; id: string }
  | { type: "APPLY_TURN"; result: TurnResult }
  | { type: "SPEND_STAT_POINT"; stat: StatKey }
  | { type: "TOGGLE_EQUIP"; itemId: string }
  | { type: "UPDATE_CHRONICLE"; text: string; upTo: string }
  | { type: "SET_EPILOGUE"; value: Epilogue }
  | { type: "BUY"; index: number; id: string; at: number }
  | { type: "SELL"; itemId: string; id: string; at: number }
  | { type: "DISMISS_COMPANION"; at: number }
  | { type: "RESET" };

export function gameReducer(state: GameSnapshot, action: Action): GameSnapshot {
  switch (action.type) {
    case "SET_GAME_STATE":
      return { ...state, gameState: action.value };
    case "START_GAME":
      return { ...newSnapshot(), player: action.player, gameLog: action.intro, gameState: "PLAYING", difficulty: action.difficulty };
    case "RESUME":
      return { ...state, gameState: resumeState(state) ?? state.gameState };
    case "ADD_LOG":
      return { ...state, gameLog: [...state.gameLog, action.value] };
    case "DISCARD_LOG":
      return { ...state, gameLog: state.gameLog.filter((m) => m.id !== action.id) };
    case "APPLY_TURN":
      return applyTurn(state, action.result);
    case "SPEND_STAT_POINT": {
      const p = state.player;
      if (!p || p.statPoints <= 0 || p.stats[action.stat] >= IN_GAME_STAT_CAP) return state;
      // STR and INT feed max HP / MP at the same rate as character creation (+3 per point).
      const hp = action.stat === "str" ? 3 : 0;
      const mp = action.stat === "int" ? 3 : 0;
      return {
        ...state,
        player: {
          ...p,
          statPoints: p.statPoints - 1,
          stats: { ...p.stats, [action.stat]: p.stats[action.stat] + 1 },
          maxHp: p.maxHp + hp,
          hp: p.hp + hp,
          maxMp: p.maxMp + mp,
          mp: p.mp + mp,
        },
      };
    }
    case "TOGGLE_EQUIP":
      // Changing gear mid-fight would be a free action; it waits until combat ends.
      if (state.gameState === "COMBAT") return state;
      return { ...state, inventory: toggleEquip(state.inventory, action.itemId) };
    case "UPDATE_CHRONICLE":
      // Ignore late replies that belong to a previous run.
      if (!state.gameLog.some((m) => m.id === action.upTo)) return state;
      return { ...state, chronicle: action.text, chronicleUpTo: action.upTo };
    case "SET_EPILOGUE":
      return state.epilogue ? state : { ...state, epilogue: action.value };
    case "BUY":
      return buyFromMerchant(state, action.index, { id: action.id, at: action.at });
    case "SELL":
      return sellToMerchant(state, action.itemId, { id: action.id, at: action.at });
    case "DISMISS_COMPANION": {
      const ally = state.companion;
      if (!ally || state.gameState === "COMBAT") return state;
      const note = { id: `part-${ally.id}`, sender: "SYSTEM" as const, text: `${ally.name} parts ways with you.`, tone: "info" as const, timestamp: action.at };
      return { ...state, companion: null, gameLog: [...state.gameLog, note] };
    }
    case "RESET":
      return newSnapshot();
    default:
      return state;
  }
}

interface GameContextValue {
  state: GameSnapshot;
  setGameState: (g: GameState) => void;
  startGame: (player: Player, intro: LogMessage[], difficulty: GameDifficulty) => void;
  resume: () => void;
  addLog: (m: LogMessage) => void;
  discardLog: (id: string) => void;
  applyTurnResult: (r: TurnResult) => void;
  spendStatPoint: (stat: StatKey) => void;
  toggleEquip: (itemId: string) => void;
  updateChronicle: (text: string, upTo: string) => void;
  setEpilogue: (value: Epilogue) => void;
  buy: (index: number) => void;
  sell: (itemId: string) => void;
  dismissCompanion: () => void;
  reset: () => void;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  // Lazy initializer: the save is read before the first render, so no effect can overwrite it.
  const [state, dispatch] = useReducer(gameReducer, undefined, () => loadSnapshot());

  useEffect(() => saveSnapshot(state), [state]);

  const actions = useMemo(
    () => ({
      setGameState: (value: GameState) => dispatch({ type: "SET_GAME_STATE", value }),
      startGame: (player: Player, intro: LogMessage[], difficulty: GameDifficulty) => dispatch({ type: "START_GAME", player, intro, difficulty }),
      resume: () => dispatch({ type: "RESUME" }),
      addLog: (value: LogMessage) => dispatch({ type: "ADD_LOG", value }),
      discardLog: (id: string) => dispatch({ type: "DISCARD_LOG", id }),
      applyTurnResult: (result: TurnResult) => dispatch({ type: "APPLY_TURN", result }),
      spendStatPoint: (stat: StatKey) => dispatch({ type: "SPEND_STAT_POINT", stat }),
      toggleEquip: (itemId: string) => dispatch({ type: "TOGGLE_EQUIP", itemId }),
      updateChronicle: (text: string, upTo: string) => dispatch({ type: "UPDATE_CHRONICLE", text, upTo }),
      setEpilogue: (value: Epilogue) => dispatch({ type: "SET_EPILOGUE", value }),
      buy: (index: number) => dispatch({ type: "BUY", index, id: makeId("item"), at: Date.now() }),
      sell: (itemId: string) => dispatch({ type: "SELL", itemId, id: makeId("sale"), at: Date.now() }),
      dismissCompanion: () => dispatch({ type: "DISMISS_COMPANION", at: Date.now() }),
      reset: () => dispatch({ type: "RESET" }),
    }),
    []
  );

  const value = useMemo<GameContextValue>(() => ({ state, ...actions }), [state, actions]);
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGameStore() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGameStore must be used inside <GameProvider>");
  return ctx;
}
