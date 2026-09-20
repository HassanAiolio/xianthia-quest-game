// Shared fixtures for unit tests.
import type { Battlefield, GameSnapshot, Player } from "@/types/game";
import { BOARD } from "./battlefield";
import type { Rng } from "./dice";
import { newSnapshot } from "./save";

export function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    name: "Tester",
    class: "Rift-Knight",
    stats: { str: 12, int: 4, dex: 7, lck: 6 },
    hp: 66,
    maxHp: 66,
    mp: 32,
    maxMp: 32,
    xp: 0,
    level: 1,
    statPoints: 0,
    ...overrides,
  };
}

/** An empty arena with everyone toe to toe, so dice tests are not about footwork. */
export function makeBattlefield(over: Partial<Battlefield> = {}): Battlefield {
  return { ...BOARD, cover: [], player: { x: 3, y: 3 }, ally: { x: 3, y: 4 }, enemy: { x: 4, y: 3 }, ...over };
}

export function makeState(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
  const state = { ...newSnapshot(), player: makePlayer(), gameState: "PLAYING" as const, ...overrides };
  if (state.gameState === "COMBAT" && !state.battlefield) state.battlefield = makeBattlefield();
  return state;
}

/** Deterministic PRNG (mulberry32) for simulations. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rng that replays fixed values (as d20 faces: 20 → 0.95+, 1 → 0). */
export function scriptedRng(values: number[]): Rng {
  let i = 0;
  return () => values[i++ % values.length];
}
export const face = (n: number, sides = 20) => (n - 1) / sides + 0.0001;
