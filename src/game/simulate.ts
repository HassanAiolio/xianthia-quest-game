// Monte-Carlo fight simulator — used by balance tests (and handy when tuning numbers).
import { classDef, type BossPhase, type CharacterClass, type Companion, type EnemyTier, type Item, type Player } from "@/types/game";
import { signatureAbility } from "./abilities";
import { resolveCombatRound } from "./combat";
import { createEnemy } from "./enemies";
import { STARTER_ITEMS } from "./items";
import { IN_GAME_STAT_CAP, baseMaxHp, baseMaxMp } from "./stats";
import type { Rng } from "./dice";

/** A typical build: creation points into the primary stat, every level-up point too. */
export function typicalPlayer(cls: CharacterClass, level: number): Player {
  const def = classDef(cls);
  const stats = { ...def.baseStats };
  stats[def.primary] = Math.min(15, stats[def.primary] + 6);
  const rest = (["str", "int", "dex", "lck"] as const).filter((k) => k !== def.primary);
  rest.forEach((k, i) => (stats[k] += [4, 3, 2][i]));
  stats[def.primary] = Math.min(IN_GAME_STAT_CAP, stats[def.primary] + (level - 1));
  const maxHp = baseMaxHp(stats) + def.growth.hp * (level - 1);
  const maxMp = baseMaxMp(stats) + def.growth.mp * (level - 1);
  return { name: "Sim", class: cls, stats, hp: maxHp, maxHp, mp: maxMp, maxMp, xp: 0, level, statPoints: 0 };
}

export interface FightStats {
  winRate: number;
  avgRounds: number;
  /** Average share of max HP lost in fights the player won. */
  avgHpLost: number;
  enemyHitRate: number;
  playerHitRate: number;
}

export interface SimOptions {
  /** Use the class signature whenever MP allows. */
  useAbility?: boolean;
  inventory?: Item[];
  companion?: Companion | null;
  bossPhase?: BossPhase;
}

export function simulateFights(player: Player, tier: EnemyTier, runs: number, rng: Rng, opts: SimOptions = {}): FightStats {
  const inventory = opts.inventory ?? STARTER_ITEMS;
  const signature = signatureAbility(player.class);
  let wins = 0, rounds = 0, hpLost = 0, enemySwings = 0, enemyHits = 0, playerSwings = 0, playerHits = 0;
  for (let r = 0; r < runs; r++) {
    let p = { ...player };
    let ally = opts.companion ? { ...opts.companion } : null;
    let enemy = createEnemy({ name: "Sim", imageDescription: "sim", tier, phase2: opts.bossPhase }, player.level, "sim", { companion: Boolean(ally) });
    for (let n = 0; n < 60; n++) {
      rounds++;
      const action = opts.useAbility && p.mp >= signature.mp ? { kind: "ability" as const } : { kind: "attack" as const };
      const round = resolveCombatRound(p, inventory, enemy, action, rng, ally);
      if (round.playerAttack) {
        playerSwings++;
        if (round.playerAttack.hit) playerHits++;
      }
      if (round.enemyAttack && round.enemyAttack.victim === "player") {
        enemySwings++;
        if (round.enemyAttack.hit) enemyHits++;
      }
      p = { ...p, hp: p.hp + round.hpDelta, mp: p.mp + round.mpDelta };
      if (ally) ally = { ...ally, hp: ally.hp + round.companionHpDelta, down: ally.down || round.companionDown };
      enemy = round.enemyAfter;
      if (round.enemyDefeated) {
        wins++;
        hpLost += (player.hp - p.hp) / player.maxHp;
        break;
      }
      if (p.hp <= 0) break;
    }
  }
  return {
    winRate: wins / runs,
    avgRounds: rounds / runs,
    avgHpLost: wins ? hpLost / wins : 1,
    enemyHitRate: enemySwings ? enemyHits / enemySwings : 0,
    playerHitRate: playerSwings ? playerHits / playerSwings : 0,
  };
}
