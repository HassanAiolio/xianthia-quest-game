import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import type {
  GameSnapshot,
  GameState,
  Item,
  LogMessage,
  Location,
  Player,
  Quest,
  Enemy,
  Stats,
  CharacterClass
} from "@/types/game";

const STORAGE_KEY = "xianthia-quest:v1";

const DEFAULT_LOCATION: Location = {
  name: "The Obsidian Antechamber",
  description:
    "Black glass walls breathe with veins of cyan light. Somewhere distant, a bell tolls in a frequency only your bones can hear.",
  imageDescription: "vast cathedral of black glass lit by floating cyan glyphs",
};

const initialSnapshot: GameSnapshot = {
  gameState: "LANDING",
  player: null,
  inventory: [
    {
      id: "starter-blade",
      name: "Sliverlight Dagger",
      type: "weapon",
      description: "Hums faintly in your hand. Cuts through ordinary metal.",
      statBonus: { str: 1 },
    },
    {
      id: "starter-stim",
      name: "Neural Stim",
      type: "consumable",
      description: "Single-use. Restores 25 HP.",
    },
  ],
  gameLog: [],
  currentLocation: DEFAULT_LOCATION,
  quests: [
    {
      id: "q1",
      title: "Awaken in Xianthia",
      description: "Find a way out of the Antechamber and locate the Rift Gate.",
      status: "active",
    },
  ],
  currentEnemy: null,
};

type Action =
  | { type: "SET_GAME_STATE"; value: GameState }
  | { type: "SET_PLAYER"; value: Player }
  | { type: "ADD_LOG"; value: LogMessage }
  | { type: "ADD_LOGS"; value: LogMessage[] }
  | { type: "APPLY_EFFECTS"; hpDelta?: number; mpDelta?: number; xpDelta?: number }
  | { type: "ADD_ITEM"; value: Item }
  | { type: "REMOVE_ITEM"; id: string }
  | { type: "SET_LOCATION"; value: Location }
  | { type: "ADD_QUEST"; value: Quest }
  | { type: "UPDATE_QUEST"; id: string; status: "active" | "completed" } 
  | { type: "SET_ENEMY"; value: Enemy | null }
  | { type: "SPEND_STAT_POINT"; stat: keyof Stats }
  | { type: "RESET" }
  | { type: "HYDRATE"; value: GameSnapshot };

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

function reducer(state: GameSnapshot, action: Action): GameSnapshot {
  switch (action.type) {
    case "SET_GAME_STATE":
      return { ...state, gameState: action.value };
    case "SET_PLAYER":
      return { ...state, player: action.value };
    case "ADD_LOG":
      return { ...state, gameLog: [...state.gameLog, action.value] };
    case "ADD_LOGS":
      return { ...state, gameLog: [...state.gameLog, ...action.value] };
    case "APPLY_EFFECTS": {
      if (!state.player) return state;
      const p = state.player;
      
      let newXp = Math.max(0, p.xp + (action.xpDelta ?? 0));
      let newLevel = p.level;
      let newMaxHp = p.maxHp;
      let newMaxMp = p.maxMp;
      let newStatPoints = p.statPoints || 0;

      // Define class-specific growth rates
      const growthRates: Record<CharacterClass, { hp: number; mp: number }> = {
        "Chrono-Mage": { hp: 8, mp: 15 },
        "Neural-Stalker": { hp: 12, mp: 10 },
        "Rift-Knight": { hp: 18, mp: 5 },
      };
      const growth = growthRates[p.class] || { hp: 12, mp: 8 };

      // LEVEL UP LOGIC
      while (newXp >= 100) {
        newLevel += 1;
        newXp -= 100;
        newMaxHp += growth.hp; // Scale HP by class
        newMaxMp += growth.mp; // Scale MP by class
        
        // Every 5th level, award 2 stat points!
        if (newLevel % 5 === 0) {
          newStatPoints += 2;
        }
      }

      const next: Player = {
        ...p,
        hp: clamp(p.hp + (action.hpDelta ?? 0), 0, newMaxHp),
        mp: clamp(p.mp + (action.mpDelta ?? 0), 0, newMaxMp),
        xp: newXp,
        level: newLevel,
        maxHp: newMaxHp,
        maxMp: newMaxMp,
        statPoints: newStatPoints, // Save the unspent points
      };
      
      const dead = next.hp <= 0;
      return { ...state, player: next, gameState: dead ? "GAMEOVER" : state.gameState };
    }

    case "SPEND_STAT_POINT": {
      if (!state.player || state.player.statPoints <= 0) return state;
      return {
        ...state,
        player: {
          ...state.player,
          statPoints: state.player.statPoints - 1,
          stats: {
            ...state.player.stats,
            [action.stat]: state.player.stats[action.stat] + 1
          }
        }
      };
    }

    case "ADD_ITEM":
      return { ...state, inventory: [...state.inventory, action.value] };
    case "REMOVE_ITEM":
      return { ...state, inventory: state.inventory.filter((i) => i.id !== action.id) };
    case "SET_LOCATION":
      return { ...state, currentLocation: action.value };
    case "ADD_QUEST":
      return { ...state, quests: [...state.quests, action.value] };
    case "UPDATE_QUEST": 
      return {
        ...state,
        quests: state.quests.map((q) =>
          q.id === action.id ? { ...q, status: action.status } : q
        ),
      };
    case "SET_ENEMY":
      return { ...state, currentEnemy: action.value };
    case "HYDRATE":
      return action.value;
    case "RESET":
      return { ...initialSnapshot, gameLog: [] };
    default:
      return state;
  }
}

interface GameContextValue {
  state: GameSnapshot;
  setGameState: (g: GameState) => void;
  setPlayer: (p: Player) => void;
  addLog: (m: LogMessage) => void;
  applyEffects: (e: { hpDelta?: number; mpDelta?: number; xpDelta?: number }) => void;
  addItem: (i: Item) => void;
  removeItem: (id: string) => void;
  setLocation: (l: Location) => void;
  addQuest: (q: Quest) => void;
  updateQuest: (id: string, status: "active" | "completed") => void;
  setEnemy: (e: Enemy | null) => void;
  spendStatPoint: (stat: keyof Stats) => void;
  reset: () => void;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialSnapshot);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) dispatch({ type: "HYDRATE", value: JSON.parse(raw) as GameSnapshot });
    } catch {
      /* ignore */
    }
  }, []);

  // Persist on every change
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state]);

  const setGameState = useCallback((g: GameState) => dispatch({ type: "SET_GAME_STATE", value: g }), []);
  const setPlayer = useCallback((p: Player) => dispatch({ type: "SET_PLAYER", value: p }), []);
  const addLog = useCallback((m: LogMessage) => dispatch({ type: "ADD_LOG", value: m }), []);
  const applyEffects = useCallback(
    (e: { hpDelta?: number; mpDelta?: number; xpDelta?: number }) =>
      dispatch({ type: "APPLY_EFFECTS", ...e }),
    []
  );
  const addItem = useCallback((i: Item) => dispatch({ type: "ADD_ITEM", value: i }), []);
  const removeItem = useCallback((id: string) => dispatch({ type: "REMOVE_ITEM", id }), []);
  const setLocation = useCallback((l: Location) => dispatch({ type: "SET_LOCATION", value: l }), []);
  const addQuest = useCallback((q: Quest) => dispatch({ type: "ADD_QUEST", value: q }), []);
  const updateQuest = useCallback(
    (id: string, status: "active" | "completed") => dispatch({ type: "UPDATE_QUEST", id, status }),
    []
  );
  const setEnemy = useCallback((e: Enemy | null) => dispatch({ type: "SET_ENEMY", value: e }), []);
  const spendStatPoint = useCallback((stat: keyof Stats) => dispatch({ type: "SPEND_STAT_POINT", stat }), []); // <-- ADD THIS
  const reset = useCallback(() => dispatch({ type: "RESET" }), []);

  const value = useMemo<GameContextValue>(
    () => ({ state, setGameState, setPlayer, addLog, applyEffects, addItem, removeItem, setLocation, addQuest, updateQuest, setEnemy, spendStatPoint, reset }),
    [state, setGameState, setPlayer, addLog, applyEffects, addItem, removeItem, setLocation, addQuest, updateQuest, setEnemy, spendStatPoint, reset]
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGameStore() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGameStore must be used inside <GameProvider>");
  return ctx;
}
