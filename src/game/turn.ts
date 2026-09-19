import { classDef, type Enemy, type GameSnapshot, type Item, type Location, type LogMessage, type LogTone, type Quest } from "@/types/game";
import { clamp } from "./dice";
import { INVENTORY_CAP, xpToNext } from "./stats";
import { chapterQuest, getChapter, mainQuestId } from "./story";

export const MAX_LOG_ENTRIES = 400;

/**
 * Everything one player turn changes, applied in a single reducer step.
 * Applying piecemeal (HP, then enemy, then mode…) is what let a later
 * "stay in COMBAT" overwrite a game over.
 */
export interface TurnResult {
  id: string;
  timestamp: number;
  logs: LogMessage[];
  hpDelta?: number;
  mpDelta?: number;
  xpGain?: number;
  location?: Location;
  addItems?: Item[];
  removeItemIds?: string[];
  addQuests?: Quest[];
  completeQuestIds?: string[];
  /** undefined = unchanged, null = combat over. */
  enemy?: Enemy | null;
  mode?: "PLAYING" | "COMBAT";
  suggestions?: string[];
  /** Counts toward the chapter's pacing (boss gate). */
  storyTurn?: boolean;
  /** The chapter boss fell: complete the main quest and open the next chapter. */
  chapterComplete?: boolean;
}

export function applyTurn(state: GameSnapshot, r: TurnResult): GameSnapshot {
  if (!state.player) return state;
  const logs = [...r.logs];
  const note = (suffix: string, text: string, tone: LogTone): LogMessage => ({
    id: `${r.id}-${suffix}`,
    sender: "SYSTEM",
    text,
    tone,
    timestamp: r.timestamp,
  });

  const player = { ...state.player };
  player.hp = clamp(player.hp + (r.hpDelta ?? 0), 0, player.maxHp);
  player.mp = clamp(player.mp + (r.mpDelta ?? 0), 0, player.maxMp);
  const dead = player.hp <= 0;

  const removed = new Set(r.removeItemIds ?? []);
  const inventory = state.inventory.filter((i) => !removed.has(i.id));
  for (const item of r.addItems ?? []) {
    if (inventory.length >= INVENTORY_CAP) {
      logs.push(note(`full-${item.id}`, `Inventory full: ${item.name} is left behind.`, "info"));
      continue;
    }
    inventory.push(item);
  }

  const completed = new Set(r.completeQuestIds ?? []);
  let quests = state.quests.map((q) => (completed.has(q.id) ? { ...q, status: "completed" as const } : q));
  for (const q of r.addQuests ?? []) if (!quests.some((x) => x.id === q.id)) quests.push(q);

  let chapter = state.chapter;
  let turnsInChapter = state.turnsInChapter + (r.storyTurn ? 1 : 0);
  let victory = false;
  if (r.chapterComplete && !dead) {
    const finished = mainQuestId(chapter);
    quests = quests.map((q) => (q.id === finished ? { ...q, status: "completed" as const } : q));
    chapter += 1;
    turnsInChapter = 0;
    const next = getChapter(chapter);
    if (next) {
      quests.push(chapterQuest(next));
      logs.push(note(`ch${next.id}`, `Chapter ${next.id}: ${next.title}. New objective: ${next.goal}`, "reward"));
    } else {
      victory = true;
    }
  }

  if (!dead && r.xpGain) {
    player.xp += r.xpGain;
    const growth = classDef(player.class).growth;
    let gained = 0;
    while (player.xp >= xpToNext(player.level)) {
      player.xp -= xpToNext(player.level);
      player.level += 1;
      player.maxHp += growth.hp;
      player.maxMp += growth.mp;
      player.statPoints += 1;
      gained += 1;
    }
    if (gained) {
      player.hp = player.maxHp;
      player.mp = player.maxMp;
      const pts = gained > 1 ? `${gained} stat points` : "1 stat point";
      logs.push(
        note(
          `lv${player.level}`,
          `LEVEL UP: level ${player.level}. Max HP +${growth.hp * gained}, max MP +${growth.mp * gained}, ${pts} to spend. Fully restored.`,
          "reward"
        )
      );
    }
  }

  return {
    ...state,
    player,
    inventory,
    quests,
    chapter,
    turnsInChapter,
    currentEnemy: r.enemy === undefined ? state.currentEnemy : r.enemy,
    currentLocation: r.location ?? state.currentLocation,
    suggestions: r.suggestions ?? state.suggestions,
    gameLog: [...state.gameLog, ...logs].slice(-MAX_LOG_ENTRIES),
    // Death wins over everything else the turn asked for.
    gameState: dead ? "GAMEOVER" : victory ? "VICTORY" : (r.mode ?? state.gameState),
  };
}
