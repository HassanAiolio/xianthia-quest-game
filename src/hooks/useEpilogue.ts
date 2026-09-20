import { useEffect, useRef } from "react";
import type { Epilogue, GameSnapshot } from "@/types/game";
import { buildEpilogueMessages } from "@/game/prompts";
import { chooseEnding } from "@/game/story";
import { runAi } from "@/services/ai";

/** When a run ends, the Aether-Core writes its closing page once — from the chronicle and the player's choices. */
export function useEpilogue(state: GameSnapshot, setEpilogue: (e: Epilogue) => void) {
  const busy = useRef(false);
  const latest = useRef(state);
  latest.current = state;

  useEffect(() => {
    const snapshot = latest.current;
    const outcome = snapshot.gameState === "VICTORY" ? "victory" : snapshot.gameState === "GAMEOVER" ? "death" : null;
    if (!outcome || snapshot.epilogue || busy.current || !snapshot.player) return;
    busy.current = true;
    runAi("epilogue", buildEpilogueMessages(snapshot, outcome))
      .then((raw) => {
        const text = (raw as { epilogue?: unknown })?.epilogue;
        if (typeof text !== "string" || !text.trim()) return;
        const ending = outcome === "victory" ? chooseEnding(snapshot.flags) : { id: "death", title: "The Rift Claims You" };
        setEpilogue({ id: ending.id, title: ending.title, text: text.trim().slice(0, 1500) });
      })
      .catch(() => {
        /* the end screen falls back to its written line */
      })
      .finally(() => {
        busy.current = false;
      });
  }, [state.gameState, state.epilogue, setEpilogue]);
}
