import type { Item, Player } from "@/types/game";
import { unlockedAbilities } from "./abilities";
import type { CombatAction } from "./combat";

export type ExploreIntent = { kind: "rest" } | { kind: "use-item"; itemId: string } | { kind: "free" };

const USE_RE = /^(?:use|drink|inject|consume|eat|apply|quaff)\s+(?:the\s+|my\s+|a\s+|an\s+|one\s+)?(.+?)[.!]*$/i;
const REST_RE = /^(?:rest|sleep|meditate|make camp|take a (?:short |long )?rest)\b/i;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, "").trim();

/** Best inventory match for a typed name: exact, then partial either way. */
export function findItem(query: string, inventory: Item[], filter: (i: Item) => boolean = () => true): Item | undefined {
  const q = norm(query);
  if (!q) return undefined;
  const pool = inventory.filter(filter);
  return (
    pool.find((i) => norm(i.name) === q) ??
    pool.find((i) => norm(i.name).includes(q)) ??
    pool.find((i) => q.includes(norm(i.name)))
  );
}

const isConsumable = (i: Item) => i.type === "consumable";

/** Outside combat: "rest" and "use <consumable>" are resolved by the engine; everything else goes to the narrator. */
export function parseExploreInput(text: string, inventory: Item[]): ExploreIntent {
  const t = text.trim();
  if (REST_RE.test(t)) return { kind: "rest" };
  const use = USE_RE.exec(t);
  if (use) {
    const item = findItem(use[1], inventory, isConsumable);
    if (item) return { kind: "use-item", itemId: item.id };
  }
  return { kind: "free" };
}

/** In combat any text is a combat move; the words only choose which one (and flavour the narration). */
export function parseCombatInput(text: string, player: Player, inventory: Item[]): CombatAction {
  const t = text.trim().toLowerCase();
  const use = USE_RE.exec(t);
  if (use) {
    const item = findItem(use[1], inventory, isConsumable);
    if (item) return { kind: "item", itemId: item.id };
  }
  // Named abilities first, so "Ghost Step" or "Bulwark" aren't read as a plain dodge/defend.
  const named = unlockedAbilities(player).find((a) => t.includes(a.name.toLowerCase()));
  if (named) return { kind: "ability", abilityId: named.id };
  if (/\b(flee|run|escape|retreat|withdraw)\b/.test(t)) return { kind: "flee" };
  if (/\b(defend|block|parry|dodge|brace|guard|shield|take cover)\b/.test(t)) return { kind: "defend" };
  if (/\b(ability|signature|special)\b/.test(t)) return { kind: "ability" };
  return { kind: "attack" };
}
