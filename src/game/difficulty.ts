import type { GameDifficulty } from "@/types/game";

export interface DifficultyRules {
  id: GameDifficulty;
  label: string;
  /** One line, shown at character creation. */
  blurb: string;
  /** Multiplier on enemy damage. */
  enemyDamage: number;
  /** Share of max HP a safe rest restores. */
  restHeal: number;
  /** Chance a rest is interrupted, before luck. */
  ambush: number;
  /** false = a killing blow leaves you at death's door instead of ending the run. */
  permadeath: boolean;
}

export const DIFFICULTIES: Record<GameDifficulty, DifficultyRules> = {
  story: {
    id: "story",
    label: "Story",
    blurb: "For the story. A killing blow leaves you at death's door instead of ending the run — it costs shards, not the adventure.",
    enemyDamage: 0.85,
    restHeal: 0.45,
    ambush: 0.2,
    permadeath: false,
  },
  normal: {
    id: "normal",
    label: "Normal",
    blurb: "The intended game. Fights bite, rests are risky, and death ends the run.",
    enemyDamage: 1,
    restHeal: 0.4,
    ambush: 0.25,
    permadeath: true,
  },
  hardcore: {
    id: "hardcore",
    label: "Hardcore",
    blurb: "Xianthia at its worst: enemies hit harder, rest mends less and is interrupted more often, and death is final.",
    enemyDamage: 1.2,
    restHeal: 0.25,
    ambush: 0.35,
    permadeath: true,
  },
};

export const rulesFor = (difficulty: GameDifficulty): DifficultyRules => DIFFICULTIES[difficulty] ?? DIFFICULTIES.normal;

/** What a killing blow costs in Story mode. */
export const NEAR_DEATH_HP = 0.3;
export const NEAR_DEATH_SHARD_LOSS = 0.25;
