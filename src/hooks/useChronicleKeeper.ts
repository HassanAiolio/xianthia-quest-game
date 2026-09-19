import { useEffect, useRef } from "react";
import type { GameSnapshot } from "@/types/game";
import { pendingChronicle } from "@/game/chronicle";
import { buildChronicleMessages } from "@/game/prompts";
import { runAi } from "@/services/ai";

/**
 * Folds older log entries into the chronicle in the background so the narrator
 * keeps long-term memory without resending the whole log every turn.
 */
export function useChronicleKeeper(state: GameSnapshot, update: (text: string, upTo: string) => void) {
  const busy = useRef(false);
  const latest = useRef(state);
  latest.current = state;

  useEffect(() => {
    const snapshot = latest.current;
    if (busy.current || !snapshot.player) return;
    const job = pendingChronicle(snapshot);
    if (!job) return;
    busy.current = true;
    runAi("chronicle", buildChronicleMessages(snapshot.chronicle, job.entries))
      .then((raw) => {
        const text = (raw as { chronicle?: unknown })?.chronicle;
        if (typeof text === "string" && text.trim()) update(text.trim().slice(0, 2000), job.upTo);
      })
      .catch(() => {
        /* not critical: it retries after the next turn */
      })
      .finally(() => {
        busy.current = false;
      });
  }, [state.gameLog.length, update]);
}
