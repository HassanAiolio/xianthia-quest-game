import type { BossPhase, Enemy, EnemyTier } from "@/types/game";
import { scaleReward } from "./stats";

interface TierSpec {
  hp: number;
  damage: number;
  ac: number;
  attack: number;
  xp: number;
  fleeDc: number;
  label: string;
}

/** Tuned so a standard fight lasts ~3–4 rounds and costs ~25% of the player's HP at any level. */
export const TIERS: Record<EnemyTier, TierSpec> = {
  minion: { hp: 0.6, damage: 0.7, ac: -1, attack: -1, xp: 15, fleeDc: 8, label: "Minion" },
  standard: { hp: 1, damage: 1, ac: 0, attack: 0, xp: 30, fleeDc: 10, label: "Hostile" },
  elite: { hp: 1.5, damage: 1.2, ac: 1, attack: 1, xp: 60, fleeDc: 13, label: "Elite" },
  boss: { hp: 2.5, damage: 1.35, ac: 2, attack: 2, xp: 120, fleeDc: 16, label: "Boss" },
};

export interface EnemySpec {
  name: string;
  imageDescription: string;
  tier: EnemyTier;
  /** True for archers, gunners and casters: they shoot instead of closing. */
  ranged?: boolean;
  /** Bosses only: what they turn into below half HP. */
  phase2?: BossPhase;
}

/** How far a shooter can strike. */
export const RANGED_REACH = 5;

/** An ally at your side shortens fights, so foes come a little tougher. */
const COMPANION_HP_BONUS = 1.25;

/** The narrator only names the enemy; every combat number comes from here. */
export function createEnemy(
  spec: EnemySpec,
  level: number,
  id: string,
  opts: { companion?: boolean; damageScale?: number } = {}
): Enemy {
  const t = TIERS[spec.tier];
  const maxHp = Math.round((16 + 4 * level) * t.hp * (opts.companion ? COMPANION_HP_BONUS : 1));
  // A shooter trades reach for staying power: it hits from five squares but is a little softer.
  const ranged = spec.ranged ? RANGED_REACH : undefined;
  return {
    ...(ranged ? { ranged } : {}),
    id,
    name: spec.name,
    tier: spec.tier,
    level,
    hp: maxHp,
    maxHp,
    ac: 13 + Math.floor(level * 0.7) + t.ac,
    attackBonus: 2 + Math.floor(level / 3) + t.attack,
    damageDie: 6,
    damageBonus: Math.max(1, Math.round((2 + level) * t.damage)),
    ...(opts.damageScale && opts.damageScale !== 1 ? { damageScale: opts.damageScale } : {}),
    xpReward: scaleReward(t.xp, level),
    imageDescription: spec.imageDescription,
    round: 0,
    ...(spec.tier === "boss" && spec.phase2 ? { phase: 1 as const, bossPhase: spec.phase2 } : {}),
  };
}
