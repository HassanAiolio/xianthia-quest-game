import type { GameSnapshot, LogMessage } from "@/types/game";
import { isStoryEntry } from "./prompts";

/** Summarize once this many story entries are waiting… */
const TRIGGER = 14;
/** …but keep the newest ones raw: the narrator sees them verbatim anyway. */
const KEEP_RAW = 6;

export interface ChronicleJob {
  entries: LogMessage[];
  upTo: string;
}

/** Returns the log slice to fold into the chronicle, or null when it isn't time yet. */
export function pendingChronicle(state: GameSnapshot): ChronicleJob | null {
  const story = state.gameLog.filter(isStoryEntry);
  const cursor = state.chronicleUpTo ? story.findIndex((m) => m.id === state.chronicleUpTo) : -1;
  const pending = cursor >= 0 ? story.slice(cursor + 1) : story.slice(-30);
  if (pending.length < TRIGGER) return null;
  const entries = pending.slice(0, pending.length - KEEP_RAW);
  return { entries, upTo: entries[entries.length - 1].id };
}
