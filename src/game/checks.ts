import { classDef, type DiceRoll, type Item, type Player, type StatKey } from "@/types/game";
import { roll, type Rng } from "./dice";
import { critThreshold, effectiveStats, mod, proficiency, scaleReward } from "./stats";

export type Difficulty = "easy" | "medium" | "hard" | "extreme";

/** Classic difficulty classes. A level-1 hero with +4 passes a medium check ~60% of the time. */
export const DC: Record<Difficulty, number> = { easy: 10, medium: 13, hard: 16, extreme: 19 };
/** Base XP for succeeding (scaled by level): taking risks is how explorers grow. */
const SUCCESS_XP: Record<Difficulty, number> = { easy: 3, medium: 6, hard: 10, extreme: 15 };

export const STAT_NAMES: Record<StatKey, string> = { str: "Strength", int: "Intellect", dex: "Dexterity", lck: "Luck" };

export interface CheckRequest {
  stat: StatKey;
  difficulty: Difficulty;
  /** What the player is attempting, in a few words ("climb the glass spire"). */
  attempt: string;
}

export interface CheckResult extends CheckRequest {
  natural: number;
  bonus: number;
  dc: number;
  success: boolean;
  /** Natural 20 (or luck-widened range) on a success, natural 1 on a failure. */
  critical: boolean;
  xp: number;
}

/** Stat modifier, plus proficiency when it's the class's own stat (the Stalker sneaks, the Mage deciphers…). */
export function checkBonus(player: Player, inventory: Item[], stat: StatKey): number {
  const proficient = classDef(player.class).primary === stat;
  return mod(effectiveStats(player, inventory)[stat]) + (proficient ? proficiency(player.level) : 0);
}

export function rollCheck(player: Player, inventory: Item[], req: CheckRequest, rng: Rng): CheckResult {
  const natural = roll(20, rng);
  const bonus = checkBonus(player, inventory, req.stat);
  const dc = DC[req.difficulty];
  const lucky = natural >= critThreshold(effectiveStats(player, inventory).lck);
  const success = natural !== 1 && (lucky || natural + bonus >= dc);
  const critical = success ? lucky : natural === 1;
  return { ...req, natural, bonus, dc, success, critical, xp: success ? scaleReward(SUCCESS_XP[req.difficulty], player.level) : 0 };
}

export function checkVerdict(r: CheckResult): string {
  return r.success ? (r.critical ? "CRITICAL SUCCESS" : "SUCCESS") : r.critical ? "CRITICAL FAILURE" : "FAILURE";
}

export function describeCheck(r: CheckResult): string {
  const sign = r.bonus >= 0 ? "+" : "";
  return `${r.stat.toUpperCase()} check (${r.difficulty}) — ${r.attempt}: d20 ${r.natural} ${sign}${r.bonus} = ${r.natural + r.bonus} vs DC ${r.dc} — ${checkVerdict(r)}`;
}

export function checkDice(r: CheckResult): DiceRoll {
  return {
    who: "player",
    kind: "check",
    label: `${STAT_NAMES[r.stat]} check`,
    natural: r.natural,
    bonus: r.bonus,
    target: r.dc,
    outcome: r.success ? (r.critical ? "critical" : "success") : r.critical ? "fumble" : "failure",
  };
}
