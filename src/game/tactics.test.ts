import { describe, expect, it } from "vitest";
import { dist } from "./battlefield";
import { playerAC } from "./stats";
import { playTurn } from "./engine";
import { createEnemy } from "./enemies";
import { face, makeBattlefield, makePlayer, makeState, scriptedRng, seededRng } from "./testing";
import type { AiRunner } from "@/services/ai";

const ai: AiRunner = async () => ({ narrative: "Steel and glass." });
const enemy = () => createEnemy({ name: "Glass Hound", imageDescription: "hound", tier: "standard" }, 1, "e1");
// Level 5, so a lucky parting blow does not end the fight the tests are measuring.
const shooter = () => createEnemy({ name: "Shard Sniper", imageDescription: "sniper", tier: "standard", ranged: true }, 5, "e2");
const text = (r: Awaited<ReturnType<typeof playTurn>>) => r.logs.map((l) => l.text).join("\n");

describe("the tactical board", () => {
  it("turns a swing from across the room into a charge", async () => {
    const state = makeState({
      gameState: "COMBAT",
      currentEnemy: enemy(),
      battlefield: makeBattlefield({ player: { x: 1, y: 3 }, ally: null, enemy: { x: 9, y: 3 } }),
    });
    const r = await playTurn(state, { kind: "combat", action: { kind: "attack" } }, { ai, rng: seededRng(3) });
    expect(text(r)).toMatch(/You advance 6 squares/);
    expect(text(r)).toMatch(/still 2 squares off/);
    expect(text(r)).not.toMatch(/Attack: d20/); // you never got there
    expect(r.battlefield!.player).toEqual({ x: 7, y: 3 });
  });

  it("lets you strike from where you stand when the ability reaches", async () => {
    const state = makeState({
      gameState: "COMBAT",
      player: makePlayer({ class: "Chrono-Mage", stats: { str: 6, int: 14, dex: 7, lck: 6 }, mp: 30 }),
      currentEnemy: enemy(),
      battlefield: makeBattlefield({ player: { x: 1, y: 3 }, ally: null, enemy: { x: 6, y: 3 } }),
    });
    const r = await playTurn(
      state,
      { kind: "combat", action: { kind: "ability", abilityId: "temporal-cascade" } },
      { ai, rng: seededRng(5) }
    );
    expect(text(r)).toMatch(/Temporal Cascade/);
    expect(text(r)).not.toMatch(/You advance/);
    expect(r.battlefield!.player).toEqual({ x: 1, y: 3 });
  });

  it("hands the enemy a free swing when you walk out of its reach", async () => {
    const state = makeState({
      gameState: "COMBAT",
      currentEnemy: enemy(),
      battlefield: makeBattlefield({ player: { x: 4, y: 3 }, ally: null, enemy: { x: 5, y: 3 } }),
    });
    const r = await playTurn(
      state,
      { kind: "combat", action: { kind: "defend" }, moveTo: { x: 1, y: 3 } },
      { ai, rng: scriptedRng([face(18)]) }
    );
    expect(text(r)).toMatch(/Glass Hound strikes as you break away/);
    expect(text(r)).toMatch(/You move 3 squares/);
    expect(r.battlefield!.player).toEqual({ x: 1, y: 3 });
    expect(r.hpDelta!).toBeLessThan(0);
  });

  it("charges nothing for shifting around inside its reach", async () => {
    const state = makeState({
      gameState: "COMBAT",
      currentEnemy: enemy(),
      battlefield: makeBattlefield({ player: { x: 4, y: 3 }, ally: null, enemy: { x: 5, y: 3 } }),
    });
    const r = await playTurn(
      state,
      { kind: "combat", action: { kind: "defend" }, moveTo: { x: 4, y: 4 } },
      { ai, rng: seededRng(9) }
    );
    expect(text(r)).not.toMatch(/breaks? away/);
    expect(r.battlefield!.player).toEqual({ x: 4, y: 4 });
  });

  it("refuses a move further than your speed", async () => {
    const state = makeState({
      gameState: "COMBAT",
      currentEnemy: enemy(),
      battlefield: makeBattlefield({ player: { x: 1, y: 3 }, ally: null, enemy: { x: 9, y: 3 } }),
    });
    const r = await playTurn(
      state,
      { kind: "combat", action: { kind: "defend" }, moveTo: { x: 9, y: 6 } },
      { ai, rng: seededRng(11) }
    );
    expect(text(r)).not.toMatch(/You move/);
    expect(r.battlefield!.player).toEqual({ x: 1, y: 3 });
  });

  it("makes the enemy spend its round closing the gap", async () => {
    const state = makeState({
      gameState: "COMBAT",
      currentEnemy: enemy(),
      battlefield: makeBattlefield({ player: { x: 1, y: 3 }, ally: null, enemy: { x: 9, y: 3 } }),
    });
    const r = await playTurn(state, { kind: "combat", action: { kind: "defend" } }, { ai, rng: seededRng(7) });
    expect(text(r)).toMatch(/Glass Hound advances 6 squares/);
    expect(text(r)).toMatch(/closes the distance instead of striking/);
    expect(r.hpDelta).toBe(0);
    expect(r.battlefield!.enemy).toEqual({ x: 3, y: 3 });
  });

  it("lets a shooter take you from five squares without closing", async () => {
    const state = makeState({
      gameState: "COMBAT",
      currentEnemy: shooter(),
      battlefield: makeBattlefield({ player: { x: 1, y: 3 }, ally: null, enemy: { x: 5, y: 3 } }),
    });
    const r = await playTurn(state, { kind: "combat", action: { kind: "defend" } }, { ai, rng: scriptedRng([face(19)]) });
    expect(text(r)).toMatch(/Shard Sniper attacks/);
    expect(text(r)).not.toMatch(/advances/);
    expect(r.battlefield!.enemy).toEqual({ x: 5, y: 3 });
  });

  it("makes a shooter give ground when you close, and charges it a free swing", async () => {
    const state = makeState({
      gameState: "COMBAT",
      currentEnemy: shooter(),
      battlefield: makeBattlefield({ player: { x: 4, y: 3 }, ally: null, enemy: { x: 5, y: 3 } }),
    });
    const r = await playTurn(state, { kind: "combat", action: { kind: "defend" } }, { ai, rng: scriptedRng([face(19)]) });
    expect(text(r)).toMatch(/You strike as Shard Sniper gives ground/);
    expect(text(r)).toMatch(/backs off \d+ squares? and takes aim/);
    expect(dist(r.battlefield!.enemy, { x: 4, y: 3 })).toBeGreaterThan(1);
  });

  it("counts a pillar between you as +2 AC", async () => {
    const state = makeState({
      gameState: "COMBAT",
      currentEnemy: shooter(),
      battlefield: makeBattlefield({ player: { x: 1, y: 3 }, ally: null, enemy: { x: 5, y: 3 }, cover: ["3,3"] }),
    });
    const r = await playTurn(state, { kind: "combat", action: { kind: "defend" } }, { ai, rng: scriptedRng([face(19)]) });
    expect(text(r)).toMatch(/You are behind cover: \+2 AC/);
    const shot = /Shard Sniper attacks: .* vs AC (\d+)/.exec(text(r))!;
    expect(Number(shot[1])).toBe(playerAC(state.player!, state.inventory, true) + 2);
  });

  it("puts the board away when the fight is over", async () => {
    const wounded = { ...enemy(), hp: 1 };
    const state = makeState({
      gameState: "COMBAT",
      currentEnemy: wounded,
      battlefield: makeBattlefield({ ally: null }),
    });
    const r = await playTurn(state, { kind: "combat", action: { kind: "attack" } }, { ai, rng: scriptedRng([face(20)]) });
    expect(r.enemy).toBeNull();
    expect(r.battlefield).toBeNull();
  });
});
