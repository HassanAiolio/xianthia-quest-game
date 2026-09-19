import { describe, expect, it } from "vitest";
import { ABILITIES, abilitiesGained, unlockedAbilities } from "./abilities";
import { describeRound, resolveCombatRound } from "./combat";
import { createCompanion } from "./companions";
import { createEnemy } from "./enemies";
import { simulateFights, typicalPlayer } from "./simulate";
import { CHAPTERS } from "./story";
import { face, makePlayer, scriptedRng, seededRng } from "./testing";
import type { EnemyTier } from "@/types/game";

const tough = (tier: EnemyTier = "standard", hp = 999) => ({ ...createEnemy({ name: "Dummy", imageDescription: "x", tier }, 5, "e"), hp, maxHp: hp });
const mage = makePlayer({ class: "Chrono-Mage", level: 8, stats: { str: 4, int: 15, dex: 5, lck: 6 }, mp: 200, maxMp: 200 });
const stalker = makePlayer({ class: "Neural-Stalker", level: 8, stats: { str: 5, int: 6, dex: 15, lck: 4 }, mp: 200, maxMp: 200 });
const knight = makePlayer({ class: "Rift-Knight", level: 8, stats: { str: 15, int: 4, dex: 5, lck: 6 }, mp: 200, maxMp: 200 });

describe("ability catalogue", () => {
  it("gives every class a signature plus three unlocks", () => {
    for (const cls of ["Chrono-Mage", "Neural-Stalker", "Rift-Knight"] as const) {
      expect(ABILITIES.filter((a) => a.cls === cls).map((a) => a.level)).toEqual([1, 3, 5, 8]);
    }
    expect(unlockedAbilities({ class: "Rift-Knight", level: 4 })).toHaveLength(2);
    expect(abilitiesGained("Rift-Knight", 4, 5).map((a) => a.id)).toEqual(["gravity-well"]);
  });
});

describe("ability effects", () => {
  it("Stasis Lock freezes the enemy once, then resists for free", () => {
    const first = resolveCombatRound(mage, [], tough(), { kind: "ability", abilityId: "stasis-lock" }, seededRng(1));
    expect(first.enemySkipped).toBe("stunned");
    expect(first.enemyAfter.effects).toMatchObject({ stunUsed: true });
    expect(first.mpDelta).toBe(-15);

    const again = resolveCombatRound(mage, [], first.enemyAfter, { kind: "ability", abilityId: "stasis-lock" }, seededRng(2));
    expect(again.ability!.effect).toBe("stun-resisted");
    expect(again.mpDelta).toBe(0); // refunded: nothing happened
    expect(again.enemyAttack).toBeDefined();
  });

  it("Neural Venom poisons for three rounds, damaging at the start of each", () => {
    const hit = resolveCombatRound(stalker, [], tough(), { kind: "ability", abilityId: "neural-venom" }, seededRng(3));
    expect(hit.enemyAfter.effects!.poison).toMatchObject({ rounds: 3 });
    let enemy = hit.enemyAfter;
    const ticks: number[] = [];
    for (let i = 0; i < 4; i++) {
      const r = resolveCombatRound(stalker, [], enemy, { kind: "defend" }, seededRng(10 + i));
      if (r.poisonTick) ticks.push(r.poisonTick);
      enemy = r.enemyAfter;
    }
    expect(ticks).toHaveLength(3);
    expect(enemy.effects!.poison).toBeUndefined();
  });

  it("Ghost Step makes the enemy's attack miss and strikes with advantage", () => {
    const r = resolveCombatRound(stalker, [], tough(), { kind: "ability", abilityId: "ghost-step" }, scriptedRng([face(3), face(18), 0.5, face(20), 0.5, 0.5]));
    expect(r.playerAttack!.rolls).toHaveLength(2);
    expect(r.playerAttack!.natural).toBe(18); // advantage takes the better die
    expect(r.enemyAttack!.dodged).toBe(true);
    expect(r.hpDelta).toBe(0);
    expect(describeRound(r, tough()).join("\n")).toMatch(/DODGED/);
  });

  it("Bulwark raises armor and ripostes when the enemy misses", () => {
    const r = resolveCombatRound(knight, [], tough(), { kind: "ability", abilityId: "bulwark" }, scriptedRng([face(2), 0.5, 0.5]));
    expect(r.enemyAttack!.target).toBeGreaterThanOrEqual(playerBaseAc(knight) + 8);
    expect(r.enemyAttack!.hit).toBe(false);
    expect(r.counter).toBeGreaterThan(0);
  });

  it("Gravity Well slows the enemy for two rounds", () => {
    const r = resolveCombatRound(knight, [], tough(), { kind: "ability", abilityId: "gravity-well" }, seededRng(5));
    expect(r.enemyAfter.effects!.slowed).toBe(1); // one spent this round, one left
    const next = resolveCombatRound(knight, [], r.enemyAfter, { kind: "attack" }, seededRng(6));
    expect(next.enemyAttack!.disadvantage).toBe(true);
    expect(next.enemyAfter.effects!.slowed).toBeUndefined();
  });

  it("Rewind heals without touching the enemy", () => {
    const hurtMage = { ...mage, hp: 20 };
    const r = resolveCombatRound(hurtMage, [], tough(), { kind: "ability", abilityId: "rewind" }, seededRng(7));
    expect(r.ability!.heal).toBe(Math.ceil(mage.maxHp * 0.35));
    expect(r.damageDealt).toBe(0);
  });

  it("an ability the player hasn't unlocked falls back to the signature", () => {
    const rookie = makePlayer({ class: "Chrono-Mage", level: 1, mp: 40, maxMp: 40 });
    const r = resolveCombatRound(rookie, [], tough(), { kind: "ability", abilityId: "chrono-collapse" }, seededRng(8));
    expect(r.ability!.id).toBe("temporal-cascade");
  });
});

function playerBaseAc(p: Parameters<typeof resolveCombatRound>[0]): number {
  return 10 + Math.floor((p.stats.dex - 5) / 2);
}

describe("boss phases", () => {
  it("shifts below half HP, then hits hard every other round (halved by guarding)", () => {
    const phase2 = CHAPTERS[0].boss.phase2;
    // 30 of 70 HP: the hit below takes it under half without finishing it.
    const boss = { ...createEnemy({ ...CHAPTERS[0].boss, tier: "boss", phase2 }, 3, "boss-ch1"), hp: 30 };
    const shift = resolveCombatRound(knight, [], boss, { kind: "attack" }, scriptedRng([face(20), 0.5, 0.5, face(1)]));
    expect(shift.phaseChange).toMatchObject({ name: phase2.name });
    expect(shift.enemyAfter.phase).toBe(2);
    expect(shift.enemyAfter.damageBonus).toBeGreaterThan(boss.damageBonus);

    // Round 2 of the fight: the special lands.
    const special = resolveCombatRound(knight, [], { ...shift.enemyAfter, hp: 50 }, { kind: "attack" }, seededRng(12));
    expect(special.enemySpecial?.name).toBe(phase2.special.name);
    const guarded = resolveCombatRound(knight, [], { ...shift.enemyAfter, hp: 50 }, { kind: "defend" }, seededRng(12));
    expect(guarded.enemySpecial!.halved).toBe(true);
    expect(guarded.enemySpecial!.damage).toBeLessThan(special.enemySpecial!.damage);
  });

  it("a phase-2 boss punishes players who only swing", () => {
    const p = typicalPlayer("Chrono-Mage", 5);
    const phase2 = CHAPTERS[1].boss.phase2;
    const bare = simulateFights(p, "boss", 1500, seededRng(21), { bossPhase: phase2 });
    const armed = simulateFights(p, "boss", 1500, seededRng(22), { bossPhase: phase2, useAbility: true });
    expect(bare.winRate).toBeLessThan(0.75);
    expect(armed.winRate).toBeGreaterThan(0.9);
  });
});

describe("companions in combat", () => {
  const ally = (role: "fighter" | "healer" | "mystic") => createCompanion({ name: "Vex", role, description: "" }, 5, "ally");

  it("fights beside the player and can be knocked down", () => {
    const enemy = tough("elite");
    const r = resolveCombatRound(knight, [], enemy, { kind: "attack" }, seededRng(31), ally("fighter"));
    expect(r.companion?.kind).toBe("attack");

    const nearlyDead = { ...ally("fighter"), hp: 1 };
    // Dice in order: the ally's own attack misses, then the enemy picks the ally (< 0.3) and crits.
    const down = resolveCombatRound(knight, [], enemy, { kind: "defend" }, scriptedRng([face(1), 0.1, face(20), 0.9, 0.9]), nearlyDead);
    expect(down.enemyAttack?.victim).toBe("companion");
    expect(down.companionDown).toBe(true);
  });

  it("a healer patches the player up when they are badly hurt", () => {
    const hurt = { ...knight, hp: 10 };
    const r = resolveCombatRound(hurt, [], tough(), { kind: "defend" }, seededRng(33), ally("healer"));
    expect(r.companion?.kind).toBe("heal");
    expect(r.hpDelta).toBeGreaterThan(0);
  });

  it("an ally shares the danger without trivialising fights", () => {
    const p = typicalPlayer("Chrono-Mage", 5);
    const solo = simulateFights(p, "standard", 1500, seededRng(41));
    const duo = simulateFights(p, "standard", 1500, seededRng(41), { companion: ally("fighter") });
    expect(duo.avgHpLost).toBeLessThan(solo.avgHpLost);
    expect(duo.avgRounds).toBeGreaterThan(solo.avgRounds - 1);
  });
});
