import { classDef, type Item, type Player, type Stats, type StatKey } from "@/types/game";

// ── Balance constants ────────────────────────────────────────────────────────
export const ABILITY_MP_COST = 10;
export const IN_GAME_STAT_CAP = 20;
export const INVENTORY_CAP = 12;
export const DEFEND_AC_BONUS = 4;
export const DEFEND_MP_GAIN = 3;

const STAT_KEYS: StatKey[] = ["str", "int", "dex", "lck"];

/** d20-style modifier: 5 → +0, 9 → +2, 15 → +5, 20 → +7. */
export const mod = (score: number): number => Math.floor((score - 5) / 2);

export const baseMaxHp = (stats: Stats): number => 30 + stats.str * 3;
export const baseMaxMp = (stats: Stats): number => 20 + stats.int * 3;

export const xpToNext = (level: number): number => 80 + 20 * level;
/** Rewards grow 20% per level so levelling pace stays roughly constant. */
export const scaleReward = (base: number, level: number): number => Math.round(base * (1 + 0.2 * (level - 1)));
export const proficiency = (level: number): number => 2 + Math.floor((level - 1) / 4);
/** Natural roll needed for a critical hit: 20, down to 17 with high luck. */
export const critThreshold = (lck: number): number => 20 - Math.min(3, Math.floor(lck / 6));

export function equippedItems(inventory: Item[]): Item[] {
  return inventory.filter((i) => i.equipped);
}

/** Base stats plus bonuses from equipped gear. */
export function effectiveStats(player: Player, inventory: Item[]): Stats {
  const out = { ...player.stats };
  for (const item of equippedItems(inventory)) {
    for (const k of STAT_KEYS) out[k] += item.statBonus?.[k] ?? 0;
  }
  return out;
}

export function armorBonus(inventory: Item[]): number {
  return equippedItems(inventory).reduce((sum, i) => sum + (i.armorBonus ?? 0), 0);
}

export function playerAC(player: Player, inventory: Item[], defending = false): number {
  const dex = effectiveStats(player, inventory).dex;
  return 10 + mod(dex) + armorBonus(inventory) + (defending ? DEFEND_AC_BONUS : 0);
}

export function primaryStat(player: Player, inventory: Item[]): number {
  return effectiveStats(player, inventory)[classDef(player.class).primary];
}

export function playerAttackBonus(player: Player, inventory: Item[]): number {
  return proficiency(player.level) + mod(primaryStat(player, inventory));
}

/** Total stat bonus a found or bought item may carry: +1 early, +2 from level 4, +3 from level 8. */
export const statBudget = (level: number): number => 1 + Math.floor(level / 4);
export const armorCap = (level: number): number => 1 + Math.floor(level / 5);

/** Only one item per slot can be equipped; consumables and keys are never equipped. */
export const isEquippable = (item: Item): boolean =>
  item.type === "weapon" || item.type === "armor" || item.type === "artifact";
