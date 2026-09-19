import type { Enemy, Item } from "@/types/game";
import { makeId, type Rng } from "./dice";
import { isEquippable } from "./stats";

export const STARTER_ITEMS: Item[] = [
  {
    id: "starter-blade",
    name: "Sliverlight Dagger",
    type: "weapon",
    description: "Hums faintly in your hand. Cuts through ordinary metal.",
    statBonus: { str: 1 },
    equipped: true,
  },
  {
    id: "starter-stim",
    name: "Neural Stim",
    type: "consumable",
    description: "Single-use injector. Restores 25 HP.",
    effect: { hp: 25 },
  },
];

const LOOT: ((level: number) => Omit<Item, "id">)[] = [
  (lv) => {
    const hp = 18 + 4 * lv;
    return { name: "Neural Stim", type: "consumable", description: `Single-use injector. Restores ${hp} HP.`, effect: { hp } };
  },
  (lv) => {
    const mp = 15 + 3 * lv;
    return { name: "Aether Vial", type: "consumable", description: `Glowing blue draught. Restores ${mp} MP.`, effect: { mp } };
  },
  (lv) => {
    const hp = 10 + 2 * lv;
    const mp = 8 + 2 * lv;
    return {
      name: "Chrono Salve",
      type: "consumable",
      description: `Rewinds a wound a few seconds. Restores ${hp} HP and ${mp} MP.`,
      effect: { hp, mp },
    };
  },
];

/** Chance of a consumable drop after a normal fight; luck helps. Bosses drop their chapter reward instead. */
export function rollLoot(enemy: Enemy, lck: number, rng: Rng): Item | null {
  const chance = 0.3 + 0.02 * lck + (enemy.tier === "elite" ? 0.3 : 0);
  if (rng() >= chance) return null;
  const make = LOOT[Math.floor(rng() * LOOT.length)];
  return { id: makeId("loot"), ...make(enemy.level) };
}

/** Equip toggles; equipping unequips whatever occupied the same slot. */
export function toggleEquip(inventory: Item[], itemId: string): Item[] {
  const target = inventory.find((i) => i.id === itemId);
  if (!target || !isEquippable(target)) return inventory;
  const equipping = !target.equipped;
  return inventory.map((i) => {
    if (i.id === itemId) return { ...i, equipped: equipping };
    if (equipping && i.type === target.type && i.equipped) return { ...i, equipped: false };
    return i;
  });
}
