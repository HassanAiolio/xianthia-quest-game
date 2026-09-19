import type { Companion, DiceRoll, Enemy, EnemyEffects, Item, Player } from "@/types/game";
import { signatureAbility, unlockedAbilities, type Ability, type AbilityId } from "./abilities";
import { companionAC } from "./companions";
import { clamp, roll, rollDice, type Rng } from "./dice";
import { TIERS } from "./enemies";
import { DEFEND_AC_BONUS, DEFEND_MP_GAIN, critThreshold, effectiveStats, mod, playerAC, playerAttackBonus, primaryStat } from "./stats";

export type CombatAction =
  | { kind: "attack" }
  | { kind: "ability"; abilityId?: AbilityId }
  | { kind: "defend" }
  | { kind: "flee" }
  | { kind: "item"; itemId: string };

export interface AttackRoll {
  /** Every d20 rolled (two with advantage or disadvantage). */
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
  /** Poison damage taken by the enemy at the start of the round. */
  poisonTick?: number;
  playerAttack?: AttackRoll;
  ability?: {
    id: AbilityId;
    name: string;
    damage: number;
    heal: number;
    crit: boolean;
    hits?: number;
    effect?: "slowed" | "poisoned" | "stunned" | "stun-resisted" | "dodge" | "bulwark";
  };
  item?: { name: string; hp: number; mp: number };
  flee?: { natural: number; bonus: number; dc: number; success: boolean };
  defended: boolean;
  companion?: { name: string; kind: "attack" | "heal" | "hex" | "bolt"; roll?: AttackRoll; damage: number; heal: number };
  phaseChange?: { name: string; description: string };
  enemyAttack?: AttackRoll & { disadvantage: boolean; victim: "player" | "companion"; dodged?: boolean };
  enemySpecial?: { name: string; damage: number; companionDamage: number; mpDrain: number; heal: number; halved: boolean };
  /** Why the enemy did not act this round. */
  enemySkipped?: "defeated" | "fled" | "stunned";
  /** Bulwark riposte damage. */
  counter?: number;
  damageDealt: number;
  enemyAfter: Enemy;
  enemyHpAfter: number;
  enemyDefeated: boolean;
  fled: boolean;
  /** Net changes, applied in order (heals first, then damage) and clamped to the bars. */
  hpDelta: number;
  mpDelta: number;
  companionHpDelta: number;
  companionDown: boolean;
}

type RollMode = "normal" | "advantage" | "disadvantage";

function d20(rng: Rng, mode: RollMode = "normal"): { rolls: number[]; natural: number } {
  if (mode === "normal") {
    const r = roll(20, rng);
    return { rolls: [r], natural: r };
  }
  const rolls = [roll(20, rng), roll(20, rng)];
  return { rolls, natural: mode === "advantage" ? Math.max(...rolls) : Math.min(...rolls) };
}

function attackRoll(rng: Rng, bonus: number, target: number, critFrom: number, damage: (crit: boolean) => number, mode: RollMode = "normal"): AttackRoll {
  const { rolls, natural } = d20(rng, mode);
  const crit = natural >= critFrom;
  const hit = natural !== 1 && (crit || natural + bonus >= target);
  return { rolls, natural, bonus, target, hit, crit, damage: hit ? Math.max(1, damage(crit)) : 0 };
}

export function resolveCombatRound(
  player: Player,
  inventory: Item[],
  enemy: Enemy,
  requested: CombatAction,
  rng: Rng = Math.random,
  companion: Companion | null = null
): CombatRound {
  const stats = effectiveStats(player, inventory);
  const pMod = mod(primaryStat(player, inventory));
  const L = player.level;
  const weapon = (crit: boolean) => (crit ? rollDice(2, 8, rng) : roll(8, rng)) + pMod + L;
  let action = requested;
  let abilityFizzled = false;

  const itemId = requested.kind === "item" ? requested.itemId : null;
  const item = itemId ? inventory.find((i) => i.id === itemId && i.type === "consumable") : undefined;
  if (action.kind === "item" && !item) action = { kind: "attack" };

  let ability: Ability | undefined;
  if (action.kind === "ability") {
    const wanted = action.abilityId;
    ability = unlockedAbilities(player).find((a) => a.id === wanted) ?? signatureAbility(player.class);
    if (player.mp < ability.mp) {
      action = { kind: "attack" };
      abilityFizzled = true;
      ability = undefined;
    }
  }

  const effects: EnemyEffects = { ...(enemy.effects ?? {}) };
  const roundNo = (enemy.round ?? 0) + 1;
  let phase = enemy.phase;
  let { attackBonus, damageBonus } = enemy;
  let enemyHp = enemy.hp;
  let dealt = 0;
  const hurt = (n: number) => {
    const d = clamp(Math.round(n), 0, enemyHp);
    enemyHp -= d;
    dealt += d;
    return d;
  };

  const round = { action: action.kind, abilityFizzled, defended: action.kind === "defend", fled: false } as CombatRound;
  let heal = 0;
  let mpChange = 0;
  let enemyMode: RollMode = "normal";
  let dodge = false;
  let bulwark = false;

  // ── Round start: poison ─────────────────────────────────────────────────────
  if (effects.poison) {
    round.poisonTick = hurt(effects.poison.damage);
    effects.poison = effects.poison.rounds > 1 ? { ...effects.poison, rounds: effects.poison.rounds - 1 } : undefined;
  }

  // ── Player turn ─────────────────────────────────────────────────────────────
  if (enemyHp > 0) {
    switch (action.kind) {
      case "attack": {
        const a = attackRoll(rng, playerAttackBonus(player, inventory), enemy.ac, critThreshold(stats.lck), weapon);
        round.playerAttack = a;
        hurt(a.damage);
        break;
      }
      case "ability": {
        const ab = ability!;
        mpChange -= ab.mp;
        const info: NonNullable<CombatRound["ability"]> = { id: ab.id, name: ab.name, damage: 0, heal: 0, crit: false };
        switch (ab.id) {
          case "temporal-cascade":
            info.damage = hurt(Math.max(1, rollDice(2, 8, rng) + pMod + L));
            enemyMode = "disadvantage";
            break;
          case "rewind":
            info.heal = Math.ceil(player.maxHp * 0.35);
            heal += info.heal;
            break;
          case "stasis-lock":
            if (effects.stunUsed) {
              info.effect = "stun-resisted";
              mpChange += ab.mp; // nothing happened: no cost
            } else {
              info.effect = "stunned";
              effects.stunned = true;
              effects.stunUsed = true;
            }
            break;
          case "chrono-collapse":
            info.damage = hurt(Math.max(1, rollDice(4, 10, rng) + pMod + L));
            break;
          case "spectral-hack":
            info.damage = hurt(Math.max(1, rollDice(3, 8, rng) + pMod + L));
            info.crit = true;
            break;
          case "ghost-step": {
            info.effect = "dodge";
            dodge = true;
            const a = attackRoll(rng, playerAttackBonus(player, inventory), enemy.ac, critThreshold(stats.lck), weapon, "advantage");
            round.playerAttack = a;
            info.damage = hurt(a.damage);
            break;
          }
          case "neural-venom":
            info.damage = hurt(Math.max(1, roll(8, rng) + pMod + L));
            info.effect = "poisoned";
            effects.poison = { rounds: 3, damage: roll(6, rng) + 1 + Math.floor(L / 2) };
            break;
          case "blackout-protocol": {
            let total = 0;
            for (let i = 0; i < 3; i++) total += Math.max(1, rollDice(2, 6, rng) + pMod);
            info.damage = hurt(total);
            info.hits = 3;
            break;
          }
          case "voidstrike":
            info.damage = hurt(Math.max(1, rollDice(2, 10, rng) + pMod + L));
            info.heal = Math.floor(info.damage / 3);
            heal += info.heal;
            break;
          case "bulwark":
            info.effect = "bulwark";
            bulwark = true;
            break;
          case "gravity-well":
            info.damage = hurt(Math.max(1, roll(10, rng) + pMod + L));
            info.effect = "slowed";
            effects.slowed = 2;
            break;
          case "event-horizon":
            info.damage = hurt(Math.max(1, rollDice(5, 8, rng) + pMod + L));
            break;
        }
        round.ability = info;
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
  }

  // ── Companion turn ──────────────────────────────────────────────────────────
  const ally = companion && !companion.down ? companion : null;
  if (ally && enemyHp > 0 && !round.fled) {
    const cl = ally.level;
    if (ally.role === "fighter") {
      const a = attackRoll(rng, 3 + Math.floor(cl / 2), enemy.ac, 20, (crit) => (crit ? rollDice(2, 6, rng) : roll(6, rng)) + 1 + Math.floor(cl / 2));
      round.companion = { name: ally.name, kind: "attack", roll: a, damage: hurt(a.damage), heal: 0 };
    } else if (ally.role === "healer" && player.hp + heal < player.maxHp / 2) {
      const h = roll(6, rng) + 2 + cl;
      heal += h;
      round.companion = { name: ally.name, kind: "heal", damage: 0, heal: h };
    } else if (ally.role === "healer") {
      const a = attackRoll(rng, 1 + Math.floor(cl / 3), enemy.ac, 20, () => roll(4, rng) + Math.floor(cl / 2));
      round.companion = { name: ally.name, kind: "attack", roll: a, damage: hurt(a.damage), heal: 0 };
    } else if (rng() < 0.4) {
      enemyMode = "disadvantage";
      round.companion = { name: ally.name, kind: "hex", damage: 0, heal: 0 };
    } else {
      round.companion = { name: ally.name, kind: "bolt", damage: hurt(roll(4, rng) + 1 + Math.floor(cl / 2)), heal: 0 };
    }
  }

  // ── Boss phase shift ────────────────────────────────────────────────────────
  if (enemy.bossPhase && phase === 1 && enemyHp > 0 && enemyHp <= enemy.maxHp / 2) {
    phase = 2;
    attackBonus += 1;
    damageBonus = Math.round(damageBonus * 1.3);
    round.phaseChange = { name: enemy.bossPhase.name, description: enemy.bossPhase.description };
  }

  // ── Enemy turn ──────────────────────────────────────────────────────────────
  let damageToPlayer = 0;
  let damageToAlly = 0;
  let drain = 0;
  if (enemyHp <= 0) round.enemySkipped = "defeated";
  else if (round.fled) round.enemySkipped = "fled";
  else if (effects.stunned) {
    round.enemySkipped = "stunned";
    effects.stunned = false;
  } else if (phase === 2 && enemy.bossPhase && roundNo % 2 === 0) {
    const sp = enemy.bossPhase.special;
    const halved = round.defended || bulwark;
    const raw = rollDice(sp.dice, sp.sides, rng) + enemy.level;
    damageToPlayer = halved ? Math.ceil(raw / 2) : raw;
    damageToAlly = ally ? Math.ceil(raw / 2) : 0;
    drain = sp.mpDrain ?? 0;
    const regain = sp.heal ? Math.min(enemy.maxHp - enemyHp, Math.round(enemy.maxHp * sp.heal)) : 0;
    enemyHp += regain;
    round.enemySpecial = { name: sp.name, damage: damageToPlayer, companionDamage: damageToAlly, mpDrain: drain, heal: regain, halved };
  } else {
    if ((effects.slowed ?? 0) > 0) enemyMode = "disadvantage";
    const damage = (crit: boolean) => (crit ? rollDice(2, enemy.damageDie, rng) : roll(enemy.damageDie, rng)) + damageBonus;
    if (ally && rng() < 0.3) {
      const a = attackRoll(rng, attackBonus, companionAC(ally), 20, damage, enemyMode);
      round.enemyAttack = { ...a, disadvantage: enemyMode === "disadvantage", victim: "companion" };
      damageToAlly = a.damage;
    } else {
      const target = playerAC(player, inventory, round.defended) + (bulwark ? 8 : 0);
      const a = attackRoll(rng, attackBonus, target, 20, damage, enemyMode);
      if (dodge && a.hit) {
        round.enemyAttack = { ...a, hit: false, crit: false, damage: 0, disadvantage: enemyMode === "disadvantage", victim: "player", dodged: true };
      } else {
        round.enemyAttack = { ...a, disadvantage: enemyMode === "disadvantage", victim: "player" };
        damageToPlayer = a.damage;
      }
      if (bulwark && !a.hit) round.counter = hurt(Math.max(1, roll(8, rng) + mod(stats.str)));
    }
  }
  if (effects.slowed) effects.slowed = effects.slowed > 1 ? effects.slowed - 1 : undefined;

  // ── Totals ──────────────────────────────────────────────────────────────────
  const hpAfterHeal = clamp(player.hp + heal, 0, player.maxHp);
  round.hpDelta = clamp(hpAfterHeal - damageToPlayer, 0, player.maxHp) - player.hp;
  round.mpDelta = clamp(player.mp + mpChange - drain, 0, player.maxMp) - player.mp;
  round.companionHpDelta = ally ? Math.max(-ally.hp, -damageToAlly) : 0;
  round.companionDown = Boolean(ally && ally.hp + round.companionHpDelta <= 0);
  round.damageDealt = dealt;
  round.enemyHpAfter = enemyHp;
  round.enemyDefeated = enemyHp <= 0;
  const cleanEffects = Object.fromEntries(Object.entries(effects).filter(([, v]) => v !== undefined && v !== false)) as EnemyEffects;
  round.enemyAfter = { ...enemy, hp: enemyHp, effects: cleanEffects, round: roundNo, phase, attackBonus, damageBonus };
  return round;
}

/** Plain-text dice lines for the log, e.g. "Attack: d20 14 +4 = 18 vs AC 12 — HIT, 9 damage". */
export function describeRound(round: CombatRound, enemy: Enemy): string[] {
  const lines: string[] = [];
  const fmt = (label: string, a: AttackRoll, extra = "") => {
    const dice = a.rolls.length > 1 ? `d20 [${a.rolls.join(", ")}]→${a.natural}` : `d20 ${a.natural}`;
    const verdict = a.crit ? "CRITICAL HIT" : a.hit ? "HIT" : "MISS";
    const dmg = a.hit ? `, ${a.damage} damage` : "";
    return `${label}: ${dice} +${a.bonus} = ${a.natural + a.bonus} vs AC ${a.target}${extra} — ${verdict}${dmg}`;
  };

  if (round.poisonTick) lines.push(`Poison burns ${enemy.name} for ${round.poisonTick}.`);
  if (round.abilityFizzled) lines.push(`Not enough MP for that ability — you strike normally.`);
  if (round.ability) {
    const ab = round.ability;
    const parts: string[] = [];
    if (ab.hits) parts.push(`${ab.hits} strikes, ${ab.damage} damage`);
    else if (ab.damage && ab.id !== "ghost-step") parts.push(`${ab.crit ? "critical, " : ""}${ab.damage} damage`);
    if (ab.heal) parts.push(`+${ab.heal} HP`);
    if (ab.effect === "slowed") parts.push("enemy slowed for 2 rounds");
    if (ab.effect === "poisoned") parts.push("poisoned for 3 rounds");
    if (ab.effect === "stunned") parts.push(`${enemy.name} is frozen in time`);
    if (ab.effect === "stun-resisted") parts.push(`${enemy.name} already broke one stasis and resists (no MP spent)`);
    if (ab.effect === "dodge") parts.push("you blink out of reach");
    if (ab.effect === "bulwark") parts.push("+8 armor this round");
    lines.push(`${ab.name}: ${parts.join(", ")}`);
  }
  if (round.playerAttack) {
    const label = round.ability?.id === "ghost-step" ? "Shadow strike" : "Attack";
    lines.push(fmt(label, round.playerAttack, round.playerAttack.rolls.length > 1 ? " (advantage)" : ""));
  }
  if (round.defended) lines.push(`You brace: +${DEFEND_AC_BONUS} AC this round, +${DEFEND_MP_GAIN} MP.`);
  if (round.item) {
    const gains = [round.item.hp && `+${round.item.hp} HP`, round.item.mp && `+${round.item.mp} MP`].filter(Boolean);
    lines.push(`You use ${round.item.name}${gains.length ? `: ${gains.join(", ")}` : ""}.`);
  }
  if (round.flee) {
    const f = round.flee;
    lines.push(`Escape: d20 ${f.natural} ${f.bonus >= 0 ? "+" : ""}${f.bonus} = ${f.natural + f.bonus} vs DC ${f.dc} — ${f.success ? "ESCAPED" : "FAILED"}`);
  }
  const c = round.companion;
  if (c?.roll) lines.push(fmt(`${c.name} attacks`, c.roll));
  if (c?.kind === "heal") lines.push(`${c.name} heals you for ${c.heal}.`);
  if (c?.kind === "hex") lines.push(`${c.name} hexes ${enemy.name}: it attacks at disadvantage.`);
  if (c?.kind === "bolt") lines.push(`${c.name}'s arcane bolt: ${c.damage} damage.`);
  if (round.phaseChange) lines.push(`PHASE 2 — ${round.phaseChange.name}: ${round.phaseChange.description}`);
  if (round.enemySpecial) {
    const s = round.enemySpecial;
    const bits = [`${s.damage} damage to you${s.halved ? " (halved by your guard)" : ""}`];
    if (s.companionDamage) bits.push(`${s.companionDamage} to your companion`);
    if (s.mpDrain) bits.push(`drains ${s.mpDrain} MP`);
    if (s.heal) bits.push(`regains ${s.heal} HP`);
    lines.push(`${enemy.name} unleashes ${s.name}: ${bits.join(", ")}.`);
  }
  if (round.enemyAttack) {
    const e = round.enemyAttack;
    const who = e.victim === "companion" ? `${enemy.name} attacks ${c?.name ?? "your companion"}` : `${enemy.name} attacks`;
    const line = fmt(who, e, e.disadvantage ? " (disadvantage)" : "");
    lines.push(e.dodged ? line.replace(/— .*$/, "— DODGED") : line);
  }
  if (round.enemySkipped === "stunned") lines.push(`${enemy.name} is frozen in time and cannot act.`);
  if (round.counter) lines.push(`Bulwark riposte: ${round.counter} damage.`);
  if (round.companionDown) lines.push(`${c?.name ?? "Your companion"} is down!`);
  if (round.enemyDefeated) lines.push(`${enemy.name} is defeated.`);
  return lines;
}

/** The round's d20s as structured data, for the dice animation. */
export function roundDice(round: CombatRound, enemy: Enemy): DiceRoll[] {
  const dice: DiceRoll[] = [];
  const attack = (who: DiceRoll["who"], label: string, a: AttackRoll): DiceRoll => ({
    who,
    kind: "attack",
    label,
    natural: a.natural,
    bonus: a.bonus,
    target: a.target,
    outcome: a.crit ? "critical" : a.hit ? "success" : a.natural === 1 ? "fumble" : "failure",
  });
  if (round.playerAttack) dice.push(attack("player", round.ability?.id === "ghost-step" ? "Shadow strike" : "Your attack", round.playerAttack));
  if (round.flee) {
    const f = round.flee;
    dice.push({ who: "player", kind: "escape", label: "Escape", natural: f.natural, bonus: f.bonus, target: f.dc, outcome: f.success ? "success" : f.natural === 1 ? "fumble" : "failure" });
  }
  if (round.companion?.roll) dice.push(attack("ally", `${round.companion.name} attacks`, round.companion.roll));
  if (round.enemyAttack) {
    const e = round.enemyAttack;
    const d = attack("enemy", e.victim === "companion" ? `${enemy.name} → ${round.companion?.name ?? "ally"}` : `${enemy.name} attacks`, e);
    dice.push(e.dodged ? { ...d, outcome: "failure" } : d);
  }
  return dice;
}

/** Used when the narrator is unreachable: the dice already happened, so the turn still resolves. */
export function fallbackCombatNarrative(round: CombatRound, enemy: Enemy): string {
  const you = round.ability
    ? `You unleash ${round.ability.name} against ${enemy.name}.`
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
    : round.enemySpecial
      ? `${enemy.name} unleashes ${round.enemySpecial.name}.`
      : round.enemyAttack?.hit
        ? `${enemy.name} answers with a blow that finds its mark.`
        : round.enemyAttack
          ? `${enemy.name}'s counterattack whistles past you.`
          : round.enemySkipped === "stunned"
            ? `${enemy.name} hangs frozen in a stalled second.`
            : "";
  return `${you} ${them}`.trim();
}
