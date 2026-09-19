import { describe, expect, it } from "vitest";
import { describeRound, resolveCombatRound } from "./combat";
import { createEnemy } from "./enemies";
import { STARTER_ITEMS } from "./items";
import { simulateFights, typicalPlayer } from "./simulate";
import { face, makePlayer, scriptedRng, seededRng } from "./testing";

const standard = (level = 1) => createEnemy({ name: "Synth", imageDescription: "x", tier: "standard" }, level, "e1");

describe("combat balance (Monte-Carlo)", () => {
  it("a standard fight lasts a few rounds and costs a real but survivable chunk of HP", () => {
    for (const cls of ["Chrono-Mage", "Neural-Stalker", "Rift-Knight"] as const) {
      for (const level of [1, 5]) {
        const s = simulateFights(typicalPlayer(cls, level), "standard", 2000, seededRng(level));
        expect(s.winRate).toBeGreaterThan(0.97);
        expect(s.avgRounds).toBeGreaterThan(2.5);
        expect(s.avgRounds).toBeLessThan(5);
        expect(s.avgHpLost).toBeGreaterThan(0.05);
        expect(s.avgHpLost).toBeLessThan(0.4);
      }
    }
  });

  it("no build is untouchable: 15 DEX still gets hit (v1: AC 25 made enemies miss forever)", () => {
    const stalker = makePlayer({ class: "Neural-Stalker", stats: { str: 5, int: 6, dex: 15, lck: 4 } });
    const s = simulateFights(stalker, "standard", 2000, seededRng(7));
    expect(s.enemyHitRate).toBeGreaterThan(0.25);
  });

  it("players hit often but not always", () => {
    const s = simulateFights(typicalPlayer("Rift-Knight", 1), "standard", 2000, seededRng(3));
    expect(s.playerHitRate).toBeGreaterThan(0.55);
    expect(s.playerHitRate).toBeLessThan(0.9);
  });

  it("bosses are dangerous without the signature ability and winnable with it", () => {
    const mage = typicalPlayer("Chrono-Mage", 3);
    const bare = simulateFights(mage, "boss", 2000, seededRng(11));
    const smart = simulateFights(mage, "boss", 2000, seededRng(12), { useAbility: true });
    expect(bare.avgHpLost).toBeGreaterThan(0.4);
    expect(smart.winRate).toBeGreaterThan(0.95);
    expect(smart.avgHpLost).toBeLessThan(bare.avgHpLost);
  });
});

describe("combat rules", () => {
  it("natural 1 always misses, natural 20 always crits", () => {
    const p = makePlayer();
    const miss = resolveCombatRound(p, STARTER_ITEMS, standard(), { kind: "attack" }, scriptedRng([face(1), face(1)]));
    expect(miss.playerAttack!.hit).toBe(false);
    const crit = resolveCombatRound(p, STARTER_ITEMS, standard(), { kind: "attack" }, scriptedRng([face(20), 0.5, 0.5, face(1)]));
    expect(crit.playerAttack!.crit).toBe(true);
    expect(crit.playerAttack!.hit).toBe(true);
  });

  it("an ability without enough MP falls back to a normal attack", () => {
    const p = makePlayer({ mp: 4 });
    const round = resolveCombatRound(p, STARTER_ITEMS, standard(), { kind: "ability" }, seededRng(1));
    expect(round.abilityFizzled).toBe(true);
    expect(round.playerAttack).toBeDefined();
    expect(round.mpDelta).toBe(0);
  });

  it("Temporal Cascade slows the enemy (disadvantage), Voidstrike heals", () => {
    const mage = makePlayer({ class: "Chrono-Mage", stats: { str: 4, int: 15, dex: 5, lck: 6 }, mp: 50, maxMp: 60 });
    const tough = { ...standard(), hp: 999, maxHp: 999 };
    const m = resolveCombatRound(mage, [], tough, { kind: "ability" }, seededRng(2));
    expect(m.enemyAttack!.disadvantage).toBe(true);
    expect(m.enemyAttack!.rolls).toHaveLength(2);
    expect(m.mpDelta).toBe(-10);

    const knight = makePlayer({ hp: 30 });
    const k = resolveCombatRound(knight, [], tough, { kind: "ability" }, scriptedRng([0.9, 0.9, face(1)]));
    expect(k.ability!.heal).toBeGreaterThan(0);
    expect(k.hpDelta).toBe(k.ability!.heal); // the enemy's natural 1 missed
  });

  it("healing is applied before damage and capped at max HP", () => {
    const p = makePlayer({ hp: 60, maxHp: 66 });
    const stim = STARTER_ITEMS[1];
    // Enemy rolls a natural 20: guaranteed hit.
    const round = resolveCombatRound(p, STARTER_ITEMS, standard(), { kind: "item", itemId: stim.id }, scriptedRng([face(20), 0.5, 0.5]));
    const damage = round.enemyAttack!.damage;
    expect(round.hpDelta).toBe(66 - damage - 60);
  });

  it("a successful escape ends the fight with no counterattack", () => {
    const round = resolveCombatRound(makePlayer(), STARTER_ITEMS, standard(), { kind: "flee" }, scriptedRng([face(20)]));
    expect(round.fled).toBe(true);
    expect(round.enemyAttack).toBeUndefined();
    expect(round.hpDelta).toBe(0);
  });

  it("describes the dice for the log", () => {
    const round = resolveCombatRound(makePlayer(), STARTER_ITEMS, standard(), { kind: "attack" }, scriptedRng([face(15), 0.5, face(3)]));
    const lines = describeRound(round, standard());
    expect(lines[0]).toMatch(/^Attack: d20 15 \+\d+ = \d+ vs AC \d+ — (HIT|MISS)/);
    expect(lines[1]).toMatch(/^Synth attacks: d20 3/);
  });
});
