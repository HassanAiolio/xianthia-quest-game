import { classDef, type Battlefield, type Companion, type Enemy, type GameSnapshot, type Item, type Location, type LogMessage, type LogTone, type Merchant, type PendingCheck, type Quest } from "@/types/game";
import { abilitiesGained } from "./abilities";
import { levelCompanion } from "./companions";
import { NEAR_DEATH_HP, NEAR_DEATH_SHARD_LOSS, rulesFor } from "./difficulty";
import { clamp } from "./dice";
import { INVENTORY_CAP, xpToNext } from "./stats";
import { chapterQuest, drawBeats, getChapter, mainQuestId } from "./story";

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
  shardsDelta?: number;
  /** undefined = unchanged, null = gone. */
  companion?: Companion | null;
  /** undefined = unchanged (cleared automatically when the player moves on), null = gone. */
  merchant?: Merchant | null;
  /** undefined = unchanged, null = the die has been rolled. */
  pendingCheck?: PendingCheck | null;
  /** Story flags earned this turn. */
  flags?: string[];
  /** undefined = unchanged, null = the fight is over and the board is put away. */
  battlefield?: Battlefield | null;
  /** An enemy died this turn. */
  kill?: boolean;
  /** Damage the player dealt this round, for the "biggest hit" line. */
  damageDealt?: number;
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

  // Story mode pulls the player back from a killing blow; it costs shards, not the run.
  let shardsLost = 0;
  let dead = player.hp <= 0;
  if (dead && !rulesFor(state.difficulty).permadeath) {
    dead = false;
    player.hp = Math.max(1, Math.ceil(player.maxHp * NEAR_DEATH_HP));
    shardsLost = Math.floor(state.shards * NEAR_DEATH_SHARD_LOSS);
    logs.push(
      note(
        "spared",
        `The Rift refuses you. You wake at death's door with ${player.hp} HP${shardsLost ? `, ${shardsLost} shards lighter` : ""}.`,
        "danger"
      )
    );
  }

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

  const levelBefore = player.level;
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
      for (const a of abilitiesGained(player.class, levelBefore, player.level)) {
        logs.push(note(`ab-${a.id}`, `New ability: ${a.name} (${a.mp} MP). ${a.text}`, "reward"));
      }
    }
  }

  let companion = r.companion !== undefined ? r.companion : state.companion;
  if (companion && companion.level !== player.level) companion = levelCompanion(companion, player.level);

  // Places for the atlas; merchants stay behind when the player moves on.
  const location = r.location ?? state.currentLocation;
  const moved = location.name !== state.currentLocation.name;
  const visited = state.visited.some((p) => p.name === location.name) ? state.visited : [...state.visited, { ...location, chapter: state.chapter }];
  const merchant = r.merchant !== undefined ? r.merchant : moved ? null : state.merchant;

  return {
    ...state,
    player,
    inventory,
    quests,
    chapter,
    turnsInChapter,
    currentEnemy: r.enemy === undefined ? state.currentEnemy : r.enemy,
    battlefield: r.battlefield === undefined ? state.battlefield : r.battlefield,
    beats: chapter === state.chapter ? state.beats : drawBeats(chapter),
    stats: {
      ...state.stats,
      turns: state.stats.turns + 1,
      kills: state.stats.kills + (r.kill ? 1 : 0),
      bosses: state.stats.bosses + (r.chapterComplete ? 1 : 0),
      biggestHit: Math.max(state.stats.biggestHit, r.damageDealt ?? 0),
      shardsEarned: state.stats.shardsEarned + Math.max(0, r.shardsDelta ?? 0),
    },
    currentLocation: location,
    visited,
    merchant,
    companion,
    pendingCheck: r.pendingCheck === undefined ? state.pendingCheck : r.pendingCheck,
    flags: r.flags?.length ? [...new Set([...state.flags, ...r.flags])] : state.flags,
    shards: Math.max(0, state.shards + (r.shardsDelta ?? 0) - shardsLost),
    suggestions: r.suggestions ?? state.suggestions,
    gameLog: [...state.gameLog, ...logs].slice(-MAX_LOG_ENTRIES),
    // Death wins over everything else the turn asked for.
    gameState: dead ? "GAMEOVER" : victory ? "VICTORY" : (r.mode ?? state.gameState),
  };
}
