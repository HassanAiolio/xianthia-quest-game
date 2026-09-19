import type { Companion, CompanionRole } from "@/types/game";

export const ROLE_LABEL: Record<CompanionRole, string> = { fighter: "Fighter", healer: "Healer", mystic: "Mystic" };
export const ROLE_TEXT: Record<CompanionRole, string> = {
  fighter: "Attacks every round.",
  healer: "Heals you when you're below half HP; otherwise lands light blows.",
  mystic: "Hexes the enemy (it attacks at disadvantage) or fires arcane bolts.",
};

export const companionMaxHp = (level: number): number => 20 + 6 * level;
export const companionAC = (c: Companion): number => 12 + Math.floor(c.level / 3);

export function createCompanion(spec: { name: string; role: CompanionRole; description: string }, level: number, id: string): Companion {
  const maxHp = companionMaxHp(level);
  return { id, ...spec, level, hp: maxHp, maxHp, down: false };
}

/** Companions grow with the player. */
export function levelCompanion(c: Companion, level: number): Companion {
  const maxHp = companionMaxHp(level);
  return { ...c, level, maxHp, hp: c.down ? c.hp : Math.min(maxHp, c.hp + (maxHp - c.maxHp)) };
}

/** Resting revives a downed companion at half HP, or patches it up like the player. */
export function restCompanion(c: Companion): Companion {
  return c.down
    ? { ...c, down: false, hp: Math.ceil(c.maxHp / 2) }
    : { ...c, hp: Math.min(c.maxHp, c.hp + Math.ceil(c.maxHp * 0.4)) };
}
