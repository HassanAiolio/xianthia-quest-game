import type { Enemy, GameSnapshot, GameState, Item, Location, LogMessage, Player, Quest } from "@/types/game";
import { makeId } from "./dice";
import { createEnemy } from "./enemies";
import { STARTER_ITEMS } from "./items";
import { CHAPTERS, chapterQuest, mainQuestId } from "./story";

export const STORAGE_KEY = "xianthia-quest:v2";
const LEGACY_KEY = "xianthia-quest:v1";

export const DEFAULT_LOCATION: Location = {
  name: "The Obsidian Antechamber",
  description:
    "Black glass walls breathe with veins of cyan light. Somewhere distant, a bell tolls in a frequency only your bones can hear.",
  imageDescription: "vast cathedral of black glass lit by floating cyan glyphs",
};

export function newSnapshot(): GameSnapshot {
  return {
    version: 2,
    gameState: "LANDING",
    player: null,
    inventory: STARTER_ITEMS.map((i) => ({ ...i })),
    gameLog: [],
    currentLocation: DEFAULT_LOCATION,
    quests: [chapterQuest(CHAPTERS[0])],
    currentEnemy: null,
    chapter: 1,
    turnsInChapter: 0,
    chronicle: "",
    chronicleUpTo: "",
    suggestions: [],
  };
}

type Raw = Record<string, any>;
const isObj = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);

function migratePlayer(p: unknown): Player | null {
  if (!isObj(p) || typeof p.name !== "string" || !isObj(p.stats)) return null;
  // Pollinations links from v1 no longer resolve (the free tier is gone).
  const portraitUrl = typeof p.portraitUrl === "string" && !p.portraitUrl.includes("pollinations") ? p.portraitUrl : undefined;
  return { ...(p as Player), statPoints: Number(p.statPoints) || 0, portraitUrl };
}

function migrateItems(items: unknown): Item[] {
  if (!Array.isArray(items)) return STARTER_ITEMS.map((i) => ({ ...i }));
  const seen = new Set<string>();
  return items.filter(isObj).map((raw) => {
    const item = { ...raw } as Item;
    // v1 let the model pick ids, so duplicates ("unique-id") happened.
    if (!item.id || seen.has(item.id)) item.id = makeId("item");
    seen.add(item.id);
    if (item.id === "starter-blade" && item.equipped === undefined) item.equipped = true;
    if (item.type === "consumable" && !item.effect) {
      const hp = Number(/restores\s+(\d+)\s*hp/i.exec(item.description ?? "")?.[1]);
      item.effect = { hp: hp > 0 ? Math.min(hp, 40) : 20 };
    }
    return item;
  });
}

function migrateQuests(quests: unknown): Quest[] {
  const list: Quest[] = Array.isArray(quests)
    ? quests.filter(isObj).map((q) => (q.id === "q1" ? { ...(q as Quest), id: mainQuestId(1), main: true } : (q as Quest)))
    : [];
  if (!list.some((q) => q.main)) list.unshift(chapterQuest(CHAPTERS[0]));
  return list;
}

function migrateEnemy(e: unknown, level: number): Enemy | null {
  if (!isObj(e) || typeof e.name !== "string") return null;
  if (typeof e.ac === "number" && typeof e.tier === "string") return e as Enemy;
  // v1 enemies carried model-invented stats; rebuild them with the real rules.
  const rebuilt = createEnemy(
    { name: e.name, imageDescription: String(e.imageDescription ?? e.name), tier: "standard" },
    level,
    String(e.id ?? makeId("enemy"))
  );
  return { ...rebuilt, hp: Math.min(rebuilt.maxHp, Math.max(1, Number(e.hp) || rebuilt.maxHp)) };
}

/** Accepts a v1 or v2 save and returns a complete v2 snapshot (or null if unusable). */
export function migrate(raw: unknown): GameSnapshot | null {
  if (!isObj(raw)) return null;
  const base = newSnapshot();
  const player = migratePlayer(raw.player);
  const gameLog: LogMessage[] = Array.isArray(raw.gameLog) ? raw.gameLog.filter(isObj) as LogMessage[] : [];
  return {
    ...base,
    ...(raw.version === 2 ? (raw as GameSnapshot) : {}),
    version: 2,
    player,
    inventory: migrateItems(raw.inventory),
    gameLog,
    currentLocation: isObj(raw.currentLocation) ? (raw.currentLocation as Location) : base.currentLocation,
    quests: migrateQuests(raw.quests),
    currentEnemy: player ? migrateEnemy(raw.currentEnemy, player.level) : null,
    chapter: Number(raw.chapter) || 1,
    turnsInChapter:
      raw.version === 2 ? Number(raw.turnsInChapter) || 0 : Math.min(6, gameLog.filter((m) => m.sender === "PLAYER").length),
    chronicle: typeof raw.chronicle === "string" ? raw.chronicle : "",
    chronicleUpTo: typeof raw.chronicleUpTo === "string" ? raw.chronicleUpTo : "",
    suggestions: Array.isArray(raw.suggestions) ? raw.suggestions.filter((s: unknown) => typeof s === "string") : [],
  };
}

/** Synchronous load for useReducer's lazy initializer — the save exists before the first render. */
export function loadSnapshot(storage: Storage | undefined = globalThis.localStorage): GameSnapshot {
  try {
    const raw = storage?.getItem(STORAGE_KEY) ?? storage?.getItem(LEGACY_KEY);
    const snap = raw ? migrate(JSON.parse(raw)) : null;
    // Always open on the title screen; "Continue" resumes the run.
    if (snap) return { ...snap, gameState: "LANDING" };
  } catch {
    /* corrupt save: start fresh */
  }
  return newSnapshot();
}

export function saveSnapshot(snapshot: GameSnapshot, storage: Storage | undefined = globalThis.localStorage): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    /* quota or private mode: the game keeps running unsaved */
  }
}

/** Where "Continue" should take the player, or null when there is nothing to resume. */
export function resumeState(snapshot: GameSnapshot): GameState | null {
  if (!snapshot.player || snapshot.player.hp <= 0) return null;
  return snapshot.currentEnemy ? "COMBAT" : "PLAYING";
}
