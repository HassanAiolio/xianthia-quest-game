import { describe, expect, it } from "vitest";
import {
  BOARD,
  approach,
  coverBonus,
  createBattlefield,
  dist,
  lineOfFire,
  provokes,
  reachable,
  type Battlefield,
} from "./battlefield";
import { seededRng } from "./testing";

const field = (over: Partial<Battlefield> = {}): Battlefield => ({
  ...BOARD,
  cover: [],
  player: { x: 1, y: 3 },
  ally: null,
  enemy: { x: 8, y: 3 },
  ...over,
});

describe("battlefield", () => {
  it("measures distance like a tabletop: a diagonal step is one square", () => {
    expect(dist({ x: 0, y: 0 }, { x: 3, y: 3 })).toBe(3);
    expect(dist({ x: 0, y: 0 }, { x: 0, y: 4 })).toBe(4);
  });

  it("walks around pillars instead of through them", () => {
    const bf = field({ cover: ["2,2", "2,3", "2,4"] });
    const options = reachable(bf, bf.player, 2);
    expect(options.has("2,3")).toBe(false);
    expect(options.has("3,3")).toBe(false); // two steps is not enough to round the wall
    expect(options.get("1,1")).toBe(2);
  });

  it("lets you pass an ally but not stop on them", () => {
    const bf = field({ ally: { x: 2, y: 3 } });
    const options = reachable(bf, bf.player, 2);
    expect(options.has("2,3")).toBe(false);
    expect(options.get("3,3")).toBe(2);
  });

  it("gives half cover to a target shot through a pillar", () => {
    const bf = field({ cover: ["4,3"] });
    expect(coverBonus(bf, bf.player, bf.enemy)).toBe(2);
    expect(coverBonus(bf, bf.player, { x: 1, y: 6 })).toBe(0);
    expect(lineOfFire({ x: 1, y: 3 }, { x: 4, y: 3 })).toEqual([{ x: 2, y: 3 }, { x: 3, y: 3 }]);
  });

  it("charges an opportunity attack only for leaving reach", () => {
    const threat = { x: 4, y: 3 };
    expect(provokes({ x: 3, y: 3 }, { x: 1, y: 3 }, threat)).toBe(true);
    expect(provokes({ x: 3, y: 3 }, { x: 3, y: 4 }, threat)).toBe(false); // still adjacent
    expect(provokes({ x: 1, y: 3 }, { x: 0, y: 3 }, threat)).toBe(false); // never was in reach
  });

  it("closes the gap as far as the speed allows", () => {
    const bf = field();
    // Seven squares apart: a full move lands you toe to toe.
    const charge = approach(bf, bf.player, bf.enemy, 6);
    expect(charge).toMatchObject({ inRange: true, spent: 6 });
    expect(dist(charge.to, bf.enemy)).toBe(1);

    // Too far to close: it spends everything and stops three squares short.
    const short = approach(field({ player: { x: 0, y: 3 }, enemy: { x: 9, y: 3 } }), { x: 0, y: 3 }, { x: 9, y: 3 }, 6);
    expect(short).toMatchObject({ inRange: false, spent: 6 });
    expect(dist(short.to, { x: 9, y: 3 })).toBe(3);

    const arrives = approach(bf, { x: 6, y: 3 }, bf.enemy, 6);
    expect(arrives.inRange).toBe(true);
    expect(arrives.spent).toBe(1);
  });

  it("stands still when already in range", () => {
    const bf = field({ player: { x: 7, y: 3 } });
    expect(approach(bf, bf.player, bf.enemy, 6)).toEqual({ to: { x: 7, y: 3 }, inRange: true, spent: 0 });
    // A ranged ability reaches without a step.
    expect(approach(field(), { x: 3, y: 3 }, { x: 8, y: 3 }, 6, 6).spent).toBe(0);
  });

  it("always generates an arena you can cross", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const bf = createBattlefield(seededRng(seed), { ally: seed % 2 === 0 });
      expect(bf.cover.length).toBeGreaterThanOrEqual(6);
      const walk = approach(bf, bf.player, bf.enemy, 40);
      expect(walk.inRange).toBe(true); // the enemy is always reachable, given time
      expect(bf.cover).not.toContain("1,3");
    }
  });
});
