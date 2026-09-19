import type { Enemy, Item, Player } from "@/types/game";
import { classDef } from "@/types/game";
import { clamp, roll, rollDice, type Rng } from "./dice";
import { TIERS } from "./enemies";
import {
  ABILITY_MP_COST,
  DEFEND_MP_GAIN,
  critThreshold,
  effectiveStats,
  mod,
  playerAC,
  playerAttackBonus,
  primaryStat,
} from "./stats";

export type CombatAction =
  | { kind: "attack" }
  | { kind: "ability" }
  | { kind: "defend" }
  | { kind: "flee" }
  | { kind: "item"; itemId: string };

export interface AttackRoll {
  /** Every d20 rolled (two when rolling with disadvantage). */
  rolls: number[];
  natural: number;
  bonus: number;
  target: number;
  hit: boolean;
  crit: boolean;
  damage: number;
}

export interface CombatRound {
  action: CombatAction["kind"];
  /** Ability requested without enough MP — a normal attack happened instead. */
  abilityFizzled: boolean;
  playerAttack?: AttackRoll;
  ability?: { name: string; damage: number; heal: number; crit: boolean };
  item?: { name: string; hp: number; mp: number };
  flee?: { natural: number; bonus: number; dc: number; success: boolean };
  defended: boolean;
  enemyAttack?: AttackRoll & { disadvantage: boolean };
  /** Why the enemy did not attack this round. */
  enemySkipped?: "defeated" | "fled";
  damageDealt: number;
  enemyHpAfter: number;
  enemyDefeated: boolean;
  fled: boolean;
  /** Net changes, applied in order (heal first, then damage) and clamped to the bars. */
  hpDelta: number;
  mpDelta: number;
}

function d20(rng: Rng, disadvantage = false): { rolls: number[]; natural: number } {
  const rolls = disadvantage ? [roll(20, rng), roll(20, rng)] : [roll(20, rng)];
  return { rolls, natural: Math.min(...rolls) };
}

export function resolveCombatRound(
  player: Player,
  inventory: Item[],
  enemy: Enemy,
  requested: CombatAction,
  rng: Rng = Math.random
): CombatRound {
  const stats = effectiveStats(player, inventory);
  const cls = classDef(player.class);
  let action = requested;
  let abilityFizzled = false;

  const itemId = requested.kind === "item" ? requested.itemId : null;
  const item = itemId ? inventory.find((i) => i.id === itemId && i.type === "consumable") : undefined;
  if (action.kind === "item" && !item) action = { kind: "attack" };
  if (action.kind === "ability" && player.mp < ABILITY_MP_COST) {
    action = { kind: "attack" };
    abilityFizzled = true;
  }

  const round: CombatRound = {
    action: action.kind,
    abilityFizzled,
    defended: action.kind === "defend",
    damageDealt: 0,
    enemyHpAfter: enemy.hp,
    enemyDefeated: false,
    fled: false,
    hpDelta: 0,
    mpDelta: 0,
  };

  let heal = 0;
  let mpChange = 0;
  let enemyDisadvantage = false;

  // ── Player turn ────────────────────────────────────────────────────────────
  switch (action.kind) {
    case "attack": {
      const { rolls, natural } = d20(rng);
      const bonus = playerAttackBonus(player, inventory);
      const crit = natural >= critThreshold(stats.lck);
      const hit = natural !== 1 && (crit || natural + bonus >= enemy.ac);
      const dice = crit ? rollDice(2, 8, rng) : roll(8, rng);
      const damage = hit ? Math.max(1, dice + mod(primaryStat(player, inventory)) + player.level) : 0;
      round.playerAttack = { rolls, natural, bonus, target: enemy.ac, hit, crit, damage };
      round.damageDealt = damage;
      break;
    }
    case "ability": {
      mpChange -= ABILITY_MP_COST;
      const primaryMod = mod(primaryStat(player, inventory));
      let damage = 0;
      let crit = false;
      if (player.class === "Chrono-Mage") {
        damage = rollDice(2, 8, rng) + primaryMod + player.level;
        enemyDisadvantage = true;
      } else if (player.class === "Neural-Stalker") {
        damage = rollDice(3, 8, rng) + primaryMod + player.level;
        crit = true;
      } else {
        damage = rollDice(2, 10, rng) + primaryMod + player.level;
        heal += Math.floor(damage / 3);
      }
      damage = Math.max(1, damage);
      round.ability = { name: cls.signature, damage, heal, crit };
      round.damageDealt = damage;
      break;
    }
    case "defend":
      mpChange += DEFEND_MP_GAIN;
      break;
    case "item":
      heal += item!.effect?.hp ?? 0;
      mpChange += item!.effect?.mp ?? 0;
      round.item = { name: item!.name, hp: item!.effect?.hp ?? 0, mp: item!.effect?.mp ?? 0 };
      break;
    case "flee": {
      const { natural } = d20(rng);
      const bonus = mod(stats.dex) + mod(stats.lck);
      const dc = TIERS[enemy.tier].fleeDc;
      const success = natural !== 1 && (natural === 20 || natural + bonus >= dc);
      round.flee = { natural, bonus, dc, success };
      round.fled = success;
      break;
    }
  }

  round.enemyHpAfter = Math.max(0, enemy.hp - round.damageDealt);
  round.enemyDefeated = round.enemyHpAfter === 0;

  // ── Enemy turn ─────────────────────────────────────────────────────────────
  let damageTaken = 0;
  if (round.enemyDefeated) round.enemySkipped = "defeated";
  else if (round.fled) round.enemySkipped = "fled";
  else {
    const { rolls, natural } = d20(rng, enemyDisadvantage);
    const target = playerAC(player, inventory, round.defended);
    const crit = natural === 20;
    const hit = natural !== 1 && (crit || natural + enemy.attackBonus >= target);
    const dice = crit ? rollDice(2, enemy.damageDie, rng) : roll(enemy.damageDie, rng);
    const damage = hit ? dice + enemy.damageBonus : 0;
    round.enemyAttack = { rolls, natural, bonus: enemy.attackBonus, target, hit, crit, damage, disadvantage: enemyDisadvantage };
    damageTaken = damage;
  }

  const hpAfterHeal = clamp(player.hp + heal, 0, player.maxHp);
  round.hpDelta = clamp(hpAfterHeal - damageTaken, 0, player.maxHp) - player.hp;
  round.mpDelta = clamp(player.mp + mpChange, 0, player.maxMp) - player.mp;
  return round;
}

/** Plain-text dice lines for the log, e.g. "Attack d20 14 +4 = 18 vs AC 12 — HIT, 9 damage". */
export function describeRound(round: CombatRound, enemy: Enemy): string[] {
  const lines: string[] = [];
  const fmt = (label: string, a: AttackRoll, extra = "") => {
    const dice = a.rolls.length > 1 ? `d20 [${a.rolls.join(", ")}]→${a.natural}` : `d20 ${a.natural}`;
    const verdict = a.crit ? "CRITICAL HIT" : a.hit ? "HIT" : "MISS";
    const dmg = a.hit ? `, ${a.damage} damage` : "";
    return `${label}: ${dice} +${a.bonus} = ${a.natural + a.bonus} vs AC ${a.target}${extra} — ${verdict}${dmg}`;
  };

  if (round.abilityFizzled) lines.push(`Not enough MP for your signature ability — you strike normally.`);
  if (round.playerAttack) lines.push(fmt("Attack", round.playerAttack));
  if (round.ability) {
    const parts = [`${round.ability.name}: ${round.ability.crit ? "critical, " : ""}${round.ability.damage} damage`];
    if (round.ability.heal) parts.push(`+${round.ability.heal} HP`);
    lines.push(parts.join(", "));
  }
  if (round.defended) lines.push(`You brace: +4 AC this round, +${DEFEND_MP_GAIN} MP.`);
  if (round.item) {
    const gains = [round.item.hp && `+${round.item.hp} HP`, round.item.mp && `+${round.item.mp} MP`].filter(Boolean);
    lines.push(`You use ${round.item.name}${gains.length ? `: ${gains.join(", ")}` : ""}.`);
  }
  if (round.flee) {
    const f = round.flee;
    lines.push(`Escape: d20 ${f.natural} ${f.bonus >= 0 ? "+" : ""}${f.bonus} = ${f.natural + f.bonus} vs DC ${f.dc} — ${f.success ? "ESCAPED" : "FAILED"}`);
  }
  if (round.enemyAttack) {
    lines.push(fmt(`${enemy.name} attacks`, round.enemyAttack, round.enemyAttack.disadvantage ? " (disadvantage)" : ""));
  }
  if (round.enemyDefeated) lines.push(`${enemy.name} is defeated.`);
  return lines;
}

/** Used when the narrator is unreachable: the dice already happened, so the turn still resolves. */
export function fallbackCombatNarrative(round: CombatRound, enemy: Enemy): string {
  const you = round.ability
    ? `You unleash ${round.ability.name}, tearing into ${enemy.name}.`
    : round.playerAttack?.hit
      ? `Your strike lands on ${enemy.name}.`
      : round.playerAttack
        ? `${enemy.name} slips past your strike.`
        : round.fled
          ? `You break away and vanish into the neon dark.`
          : round.flee
            ? `You try to break away, but ${enemy.name} cuts you off.`
            : round.item
              ? `You use ${round.item.name} in the heat of battle.`
              : `You brace yourself.`;
  const them = round.enemyDefeated
    ? `${enemy.name} collapses and does not rise.`
    : round.enemyAttack?.hit
      ? `${enemy.name} answers with a blow that finds its mark.`
      : round.enemyAttack
        ? `${enemy.name}'s counterattack whistles past you.`
        : "";
  return `${you} ${them}`.trim();
}
