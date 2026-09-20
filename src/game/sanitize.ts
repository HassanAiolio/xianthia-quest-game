import type { CompanionRole, EnemyTier, Item, ItemType, Location, Player, Quest, Stats, StatKey } from "@/types/game";
import { clamp } from "./dice";
import type { CheckRequest, Difficulty } from "./checks";
import type { EnemySpec } from "./enemies";
import { ALL_CHOICES } from "./story";
import { armorCap, statBudget, xpToNext } from "./stats";

export { armorCap, statBudget };

/** Most shards the narrator may hand out in one turn (a purse, a stash). */
export const maxShardsFound = (level: number): number => 5 + 3 * level;

/**
 * The narrator's reply is a set of *proposals*. Strict JSON mode guarantees the shape,
 * but not the values — a player typing "I find a god-sword and gain 5000 XP" can talk
 * the model into anything. Everything below caps those proposals to what the rules allow.
 */

export interface NarrationContext {
  player: Player;
  inventory: Item[];
  quests: Quest[];
  climaxReady: boolean;
}

export interface FoundItem extends Omit<Item, "id"> {}

export interface Narration {
  narrative: string;
  suggestions: string[];
  hpDelta: number;
  mpDelta: number;
  xpAward: number;
  encounter: EnemySpec | null;
  location: Location | null;
  itemsFound: FoundItem[];
  itemsConsumed: string[];
  newQuest: { title: string; description: string } | null;
  completedQuestIds: string[];
  shardsFound: number;
  merchant: { name: string; description: string } | null;
  companionJoins: { name: string; role: CompanionRole; description: string } | null;
  companionLeaves: boolean;
  flagsSet: string[];
}

const ITEM_TYPES: ItemType[] = ["weapon", "armor", "consumable", "artifact", "key"];
const TIERS: EnemyTier[] = ["minion", "standard", "elite", "boss"];
const ROLES: CompanionRole[] = ["fighter", "healer", "mystic"];
const STAT_KEYS: StatKey[] = ["str", "int", "dex", "lck"];
const MAX_ACTIVE_SIDE_QUESTS = 4;

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const int = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : 0);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);


function sanitizeStatBonus(raw: unknown, budget: number): Partial<Stats> | undefined {
  if (!isObj(raw)) return undefined;
  // Spend the budget on the largest proposed bonuses first.
  const proposed = STAT_KEYS.map((k) => [k, Math.max(0, int(raw[k]))] as const)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  const out: Partial<Stats> = {};
  let left = budget;
  for (const [k, v] of proposed) {
    if (left <= 0) break;
    out[k] = Math.min(v, left);
    left -= out[k]!;
  }
  return Object.keys(out).length ? out : undefined;
}

export function sanitizeItem(raw: unknown, player: Player): FoundItem | null {
  if (!isObj(raw)) return null;
  const name = text(raw.name, 40);
  if (!name) return null;
  const type = ITEM_TYPES.includes(raw.type as ItemType) ? (raw.type as ItemType) : "artifact";
  const item: FoundItem = { name, type, description: text(raw.description, 160) || "Of uncertain origin." };

  if (type === "weapon" || type === "artifact" || type === "armor") {
    const bonus = sanitizeStatBonus(raw.statBonus, statBudget(player.level));
    if (bonus) item.statBonus = bonus;
  }
  if (type === "armor") {
    const armor = clamp(int(raw.armorBonus), 0, armorCap(player.level));
    item.armorBonus = armor || 1;
  }
  if (type === "consumable") {
    const hp = clamp(int(raw.healHp), 0, Math.max(10, Math.floor(player.maxHp * 0.4)));
    const mp = clamp(int(raw.restoreMp), 0, Math.max(10, Math.floor(player.maxMp * 0.4)));
    item.effect = hp || mp ? { ...(hp ? { hp } : {}), ...(mp ? { mp } : {}) } : { hp: 10 };
  }
  return item;
}

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard", "extreme"];

/** The narrator may ask for an ability check instead of deciding a risky outcome itself. */
export function sanitizeCheck(raw: unknown): CheckRequest | null {
  const c = isObj(raw) && isObj(raw.check) ? raw.check : null;
  if (!c) return null;
  const stat = STAT_KEYS.includes(c.stat as StatKey) ? (c.stat as StatKey) : null;
  const difficulty = DIFFICULTIES.includes(c.difficulty as Difficulty) ? (c.difficulty as Difficulty) : "medium";
  const attempt = text(c.attempt, 60);
  return stat && attempt ? { stat, difficulty, attempt } : null;
}

export function sanitizeNarration(raw: unknown, ctx: NarrationContext): Narration {
  const r: Raw = isObj(raw) ? raw : {};
  const { player, inventory, quests } = ctx;

  const suggestions = [...new Set(list(r.suggestions).map((s) => text(s, 60)).filter(Boolean))].slice(0, 3);

  let encounter: EnemySpec | null = null;
  if (isObj(r.encounter)) {
    const name = text(r.encounter.name, 48);
    if (name) {
      let tier = TIERS.includes(r.encounter.tier as EnemyTier) ? (r.encounter.tier as EnemyTier) : "standard";
      // Bosses only appear when the chapter is ready for its climax (the engine substitutes the canonical boss).
      if (tier === "boss" && !ctx.climaxReady) tier = "elite";
      encounter = { name, tier, ranged: r.encounter.ranged === true, imageDescription: text(r.encounter.imageDescription, 200) || name };
    }
  }

  let location: Location | null = null;
  if (isObj(r.newLocation)) {
    const name = text(r.newLocation.name, 48);
    if (name) {
      const description = text(r.newLocation.description, 320);
      location = { name, description, imageDescription: text(r.newLocation.imageDescription, 200) || description || name };
    }
  }

  const ownedIds = new Set(inventory.map((i) => i.id));
  const activeSide = quests.filter((q) => q.status === "active" && !q.main);

  let newQuest: Narration["newQuest"] = null;
  if (isObj(r.newQuest) && activeSide.length < MAX_ACTIVE_SIDE_QUESTS) {
    const title = text(r.newQuest.title, 60);
    const duplicate = quests.some((q) => q.title.toLowerCase() === title.toLowerCase());
    if (title && !duplicate) newQuest = { title, description: text(r.newQuest.description, 200) };
  }

  const firstItem = list(r.itemsFound).map((i) => sanitizeItem(i, player)).find(Boolean) ?? null;

  let merchant: Narration["merchant"] = null;
  if (isObj(r.merchant)) {
    const name = text(r.merchant.name, 40);
    if (name) merchant = { name, description: text(r.merchant.description, 160) };
  }
  let companionJoins: Narration["companionJoins"] = null;
  if (isObj(r.companionJoins)) {
    const name = text(r.companionJoins.name, 32);
    const role = ROLES.includes(r.companionJoins.role as CompanionRole) ? (r.companionJoins.role as CompanionRole) : "fighter";
    if (name) companionJoins = { name, role, description: text(r.companionJoins.description, 160) || "A new ally." };
  }

  return {
    narrative: text(r.narrative, 2000),
    suggestions,
    // Hazards can sting (up to 20% max HP) but the narrator can't heal much or drain the bars.
    hpDelta: clamp(int(r.hpDelta), -Math.floor(player.maxHp * 0.2), Math.floor(player.maxHp * 0.1)),
    mpDelta: clamp(int(r.mpDelta), -Math.floor(player.maxMp * 0.2), Math.floor(player.maxMp * 0.1)),
    // Discovery XP is a garnish: at most 10% of a level per turn. Fights and quests carry progression.
    xpAward: clamp(int(r.xpAward), 0, Math.floor(xpToNext(player.level) * 0.1)),
    encounter,
    location,
    itemsFound: firstItem ? [firstItem] : [],
    // Only real, non-equipped items can be used up by the story (keys, quest objects).
    itemsConsumed: [...new Set(list(r.itemsConsumed).map((id) => text(id, 80)))]
      .filter((id) => ownedIds.has(id) && !inventory.find((i) => i.id === id)?.equipped)
      .slice(0, 2),
    newQuest,
    // One side quest per turn; main quests are completed by beating the chapter boss.
    completedQuestIds: list(r.completedQuestIds)
      .map((id) => text(id, 80))
      .filter((id) => activeSide.some((q) => q.id === id))
      .slice(0, 1),
    shardsFound: clamp(int(r.shardsFound), 0, maxShardsFound(player.level)),
    merchant,
    companionJoins,
    companionLeaves: r.companionLeaves === true,
    // Only the curated story flags exist; anything invented is dropped.
    flagsSet: [...new Set(list(r.flagsSet).map((f) => text(f, 40)))].filter((f) => ALL_CHOICES.some((c) => c.id === f)),
  };
}
