import { classDef, type CharacterClass, type Enemy, type EnemyTier, type GameSnapshot, type Item, type LogMessage, type ShopItem, type StatKey } from "@/types/game";
import { makeId, type Rng } from "./dice";
import { INVENTORY_CAP, armorCap, statBudget } from "./stats";

/**
 * Aether shards: earned from fights and finds, spent at merchants.
 * Prices and stock are decided here, never by the narrator.
 */

const SHARDS_BY_TIER: Record<EnemyTier, number> = { minion: 4, standard: 8, elite: 18, boss: 40 };

export function shardReward(enemy: Enemy, lck: number, rng: Rng): number {
  const base = Math.round(SHARDS_BY_TIER[enemy.tier] * (1 + 0.25 * (enemy.level - 1)));
  return base + Math.floor(rng() * (1 + lck / 2));
}

export function itemValue(item: Item): number {
  if (item.type === "key") return 0;
  if (item.type === "consumable") return 6 + Math.round(((item.effect?.hp ?? 0) + (item.effect?.mp ?? 0)) * 0.6);
  const stats = Object.values(item.statBonus ?? {}).reduce((sum, v) => sum + (v ?? 0), 0);
  return 15 + 30 * stats + 25 * (item.armorBonus ?? 0);
}

export const sellPrice = (item: Item): number => Math.floor(itemValue(item) * 0.4);
export const canSell = (item: Item): boolean => !item.equipped && item.type !== "key" && sellPrice(item) > 0;

const GEAR_NAMES: Record<"weapon" | "armor" | "artifact", string[]> = {
  weapon: ["Arc-Edge Kukri", "Riftglass Saber", "Pulse Knuckles", "Static Lance", "Chronoblade Shard", "Hollowpoint Sling"],
  armor: ["Glasswoven Coat", "Mirrorplate Vest", "Nullsilk Cloak", "Static-Dampened Mail", "Bellwarden Pauldrons"],
  artifact: ["Choir Chip", "Hourglass Pendant", "Ghostlight Lens", "Void Compass", "Sable's Thimble"],
};
const GEAR_TEXT: Record<"weapon" | "armor" | "artifact", string> = {
  weapon: "Market-forged and well balanced.",
  armor: "Light enough to run in, hard enough to matter.",
  artifact: "It hums faintly when you hold it close.",
};

const pick = <T>(list: T[], rng: Rng): T => list[Math.floor(rng() * list.length)];

function gearFor(type: "weapon" | "armor" | "artifact", level: number, cls: CharacterClass, rng: Rng): Item {
  const stat: StatKey =
    type === "weapon" ? classDef(cls).primary : type === "armor" ? pick<StatKey>(["str", "dex"], rng) : pick<StatKey>(["int", "lck", "dex"], rng);
  const item: Item = {
    id: makeId("shop"),
    name: pick(GEAR_NAMES[type], rng),
    type,
    description: GEAR_TEXT[type],
    statBonus: { [stat]: statBudget(level) },
  };
  if (type === "armor") item.armorBonus = armorCap(level);
  return item;
}

function consumable(kind: number, level: number): Item {
  const items: Omit<Item, "id">[] = [
    { name: "Neural Stim", type: "consumable", description: `Restores ${18 + 4 * level} HP.`, effect: { hp: 18 + 4 * level } },
    { name: "Aether Vial", type: "consumable", description: `Restores ${15 + 3 * level} MP.`, effect: { mp: 15 + 3 * level } },
    {
      name: "Chrono Salve",
      type: "consumable",
      description: `Restores ${10 + 2 * level} HP and ${8 + 2 * level} MP.`,
      effect: { hp: 10 + 2 * level, mp: 8 + 2 * level },
    },
  ];
  return { id: makeId("shop"), ...items[kind % items.length] };
}

interface Stamp {
  id: string;
  at: number;
}

const tradeLog = (id: string, text: string, at: number): LogMessage => ({ id, sender: "SYSTEM", text, tone: "reward", timestamp: at });

/** Buy the merchant's offer at `index`. No-op when it can't be afforded, the pack is full, or a fight is on. */
export function buyFromMerchant(state: GameSnapshot, index: number, stamp: Stamp): GameSnapshot {
  const m = state.merchant;
  const offer = m?.stock[index];
  if (!m || !offer || state.gameState === "COMBAT" || state.shards < offer.price || state.inventory.length >= INVENTORY_CAP) return state;
  const item = { ...offer.item, id: stamp.id, equipped: false };
  return {
    ...state,
    shards: state.shards - offer.price,
    inventory: [...state.inventory, item],
    merchant: { ...m, stock: m.stock.filter((_, i) => i !== index) },
    gameLog: [...state.gameLog, tradeLog(`buy-${stamp.id}`, `Bought ${item.name} for ${offer.price} shards.`, stamp.at)],
  };
}

/** Sell an unequipped item for 40% of its value; the merchant offers it back at full price. */
export function sellToMerchant(state: GameSnapshot, itemId: string, stamp: Stamp): GameSnapshot {
  const m = state.merchant;
  const item = state.inventory.find((i) => i.id === itemId);
  if (!m || !item || state.gameState === "COMBAT" || !canSell(item)) return state;
  const price = sellPrice(item);
  return {
    ...state,
    shards: state.shards + price,
    inventory: state.inventory.filter((i) => i.id !== itemId),
    merchant: { ...m, stock: [...m.stock, { item, price: itemValue(item) }] },
    gameLog: [...state.gameLog, tradeLog(`sell-${stamp.id}`, `Sold ${item.name} for ${price} shards.`, stamp.at)],
  };
}

/** A merchant's wares: three consumables and two pieces of gear sized to the player's level. */
export function generateStock(level: number, cls: CharacterClass, rng: Rng): ShopItem[] {
  const gearTypes = (["weapon", "armor", "artifact"] as const).slice().sort(() => rng() - 0.5).slice(0, 2);
  const items = [consumable(0, level), consumable(1, level), consumable(2, level), ...gearTypes.map((t) => gearFor(t, level, cls, rng))];
  return items.map((item) => ({ item, price: itemValue(item) }));
}
