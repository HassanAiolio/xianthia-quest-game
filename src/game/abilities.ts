import type { CharacterClass, Player } from "@/types/game";

export type AbilityId =
  | "temporal-cascade"
  | "rewind"
  | "stasis-lock"
  | "chrono-collapse"
  | "spectral-hack"
  | "ghost-step"
  | "neural-venom"
  | "blackout-protocol"
  | "voidstrike"
  | "bulwark"
  | "gravity-well"
  | "event-horizon";

export interface Ability {
  id: AbilityId;
  name: string;
  cls: CharacterClass;
  /** Level at which it unlocks. */
  level: number;
  mp: number;
  text: string;
}

/** Each class: a signature at level 1, then one new tool at 3, 5 and 8. Effects live in combat.ts. */
export const ABILITIES: Ability[] = [
  { id: "temporal-cascade", name: "Temporal Cascade", cls: "Chrono-Mage", level: 1, mp: 10, text: "Guaranteed hit (2d8 + INT + level). Time slows: the enemy strikes back at disadvantage." },
  { id: "rewind", name: "Rewind", cls: "Chrono-Mage", level: 3, mp: 12, text: "Undo your wounds: heal 35% of your max HP." },
  { id: "stasis-lock", name: "Stasis Lock", cls: "Chrono-Mage", level: 5, mp: 15, text: "Freeze the enemy in time: it loses its next action. Once per fight." },
  { id: "chrono-collapse", name: "Chrono Collapse", cls: "Chrono-Mage", level: 8, mp: 22, text: "Collapse every second at once: 4d10 + INT + level." },

  { id: "spectral-hack", name: "Spectral Hack", cls: "Neural-Stalker", level: 1, mp: 10, text: "Guaranteed critical strike (3d8 + DEX + level). The heaviest burst in the game." },
  { id: "ghost-step", name: "Ghost Step", cls: "Neural-Stalker", level: 3, mp: 8, text: "Blink out of reach: the enemy's next attack on you misses, and you strike from the shadows." },
  { id: "neural-venom", name: "Neural Venom", cls: "Neural-Stalker", level: 5, mp: 12, text: "1d8 + DEX + level now, then poison for 3 rounds." },
  { id: "blackout-protocol", name: "Blackout Protocol", cls: "Neural-Stalker", level: 8, mp: 22, text: "Three guaranteed strikes of 2d6 + DEX." },

  { id: "voidstrike", name: "Voidstrike", cls: "Rift-Knight", level: 1, mp: 10, text: "Guaranteed hit (2d10 + STR + level). Heals you for a third of the damage dealt." },
  { id: "bulwark", name: "Bulwark", cls: "Rift-Knight", level: 3, mp: 6, text: "+8 armor this round; if the enemy misses you, you counter for 1d8 + STR." },
  { id: "gravity-well", name: "Gravity Well", cls: "Rift-Knight", level: 5, mp: 12, text: "1d10 + STR + level and the enemy is slowed (disadvantage) for 2 rounds." },
  { id: "event-horizon", name: "Event Horizon", cls: "Rift-Knight", level: 8, mp: 22, text: "Tear the void open: 5d8 + STR + level." },
];

export function abilityById(id: string): Ability | undefined {
  return ABILITIES.find((a) => a.id === id);
}

export function signatureAbility(cls: CharacterClass): Ability {
  return ABILITIES.find((a) => a.cls === cls && a.level === 1)!;
}

export function unlockedAbilities(player: Pick<Player, "class" | "level">): Ability[] {
  return ABILITIES.filter((a) => a.cls === player.class && a.level <= player.level);
}

export function nextAbility(player: Pick<Player, "class" | "level">): Ability | undefined {
  return ABILITIES.find((a) => a.cls === player.class && a.level > player.level);
}

/** Abilities that become available when levelling from `from` to `to`. */
export function abilitiesGained(cls: CharacterClass, from: number, to: number): Ability[] {
  return ABILITIES.filter((a) => a.cls === cls && a.level > from && a.level <= to);
}
