import type { Battlefield, EnemyTier, Square } from "@/types/game";
import type { Rng } from "./dice";

export type { Battlefield, Square };

/**
 * The tactical layer: where everyone stands, what blocks a shot, how far a turn takes you.
 * A square is 5 ft and every step costs one, diagonals included — the fast variant from
 * the DMG, which keeps a phone-sized board readable.
 */

export type TokenId = "player" | "ally" | "enemy";

export const BOARD = { w: 10, h: 7 };
export const MELEE_REACH = 1;
/** A blast still lands a few squares out, so a boss is never harmless. */
export const SPECIAL_RANGE = 3;

const TIER_SPEED: Record<EnemyTier, number> = { minion: 7, standard: 6, elite: 6, boss: 5 };

export const key = (s: Square) => `${s.x},${s.y}`;
export const same = (a: Square, b: Square) => a.x === b.x && a.y === b.y;
/** Chebyshev: a diagonal step covers as much ground as a straight one. */
export const dist = (a: Square, b: Square) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const enemySpeed = (tier: EnemyTier) => TIER_SPEED[tier];

/** How far the player moves in a round: 6 squares, or half that while slowed. */
export function playerSpeed(slowed = false): number {
  return slowed ? 3 : 6;
}

function inside(bf: Battlefield, s: Square) {
  return s.x >= 0 && s.y >= 0 && s.x < bf.w && s.y < bf.h;
}

function neighbours(s: Square): Square[] {
  const out: Square[] = [];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (dx || dy) out.push({ x: s.x + dx, y: s.y + dy });
  return out;
}

export function occupied(bf: Battlefield): Square[] {
  return [bf.player, bf.enemy, ...(bf.ally ? [bf.ally] : [])];
}

/** Walls block; friends don't — you can walk through them, you just can't stop there. */
function walkable(bf: Battlefield, s: Square, coverSet: Set<string>) {
  return inside(bf, s) && !coverSet.has(key(s));
}

/**
 * Every square a token can stop on this round, with what the trip costs.
 * Moving through someone is allowed; ending your move on them is not.
 */
export function reachable(bf: Battlefield, from: Square, speed: number): Map<string, number> {
  const coverSet = new Set(bf.cover);
  const taken = new Set(occupied(bf).filter((s) => !same(s, from)).map(key));
  const cost = new Map<string, number>([[key(from), 0]]);
  let edge = [from];
  for (let step = 1; step <= speed; step++) {
    const next: Square[] = [];
    for (const s of edge) {
      for (const n of neighbours(s)) {
        if (!walkable(bf, n, coverSet) || cost.has(key(n))) continue;
        cost.set(key(n), step);
        next.push(n);
      }
    }
    edge = next;
  }
  cost.delete(key(from));
  for (const t of taken) cost.delete(t);
  return cost;
}

/** The squares a shot crosses between two tokens, endpoints excluded (Bresenham). */
export function lineOfFire(a: Square, b: Square): Square[] {
  const out: Square[] = [];
  let { x, y } = a;
  const dx = Math.abs(b.x - x);
  const dy = Math.abs(b.y - y);
  const sx = x < b.x ? 1 : -1;
  const sy = y < b.y ? 1 : -1;
  let err = dx - dy;
  for (;;) {
    if (x === b.x && y === b.y) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
    if (x === b.x && y === b.y) break;
    out.push({ x, y });
  }
  return out;
}

/** Half cover, the tabletop standard: +2 AC when something solid is in the way. */
export function coverBonus(bf: Battlefield, from: Square, to: Square): number {
  const coverSet = new Set(bf.cover);
  return lineOfFire(from, to).some((s) => coverSet.has(key(s))) ? 2 : 0;
}

/** Stepping out of a melee's reach hands it a free swing. */
export function provokes(from: Square, to: Square, threat: Square): boolean {
  return dist(from, threat) <= MELEE_REACH && dist(to, threat) > MELEE_REACH;
}

/**
 * The closest square to `target` a token can reach this round, and whether it ends
 * the move within `range`. Used for both "walk up and hit it" and the enemy's turn.
 */
export function approach(bf: Battlefield, from: Square, target: Square, speed: number, range = MELEE_REACH): { to: Square; inRange: boolean; spent: number } {
  if (dist(from, target) <= range) return { to: from, inRange: true, spent: 0 };
  const options = reachable(bf, from, speed);
  // Straightness, so a charge does not wander diagonally between equally close squares.
  const drift = (s: Square) => (s.x - target.x) ** 2 + (s.y - target.y) ** 2;
  let best = { to: from, inRange: false, spent: 0, gap: dist(from, target), drift: drift(from) };
  for (const [k, spent] of options) {
    const [x, y] = k.split(",").map(Number);
    const to = { x, y };
    const gap = dist(to, target);
    // Closer wins; then the straighter line; then the shorter walk.
    const better =
      gap < best.gap ||
      (gap === best.gap && (drift(to) < best.drift || (drift(to) === best.drift && spent < best.spent)));
    if (better) best = { to, inRange: gap <= range, spent, gap, drift: drift(to) };
  }
  return { to: best.to, inRange: best.inRange, spent: best.spent };
}

/**
 * The opposite of `approach`: back away from a threat, ideally to `want` squares off.
 * Shooters use it to buy themselves a clear shot.
 */
export function retreat(bf: Battlefield, from: Square, threat: Square, speed: number, want: number): { to: Square; spent: number } {
  const score = (s: Square) => Math.min(dist(s, threat), want);
  let best = { to: from, spent: 0, score: score(from) };
  for (const [k, spent] of reachable(bf, from, speed)) {
    const [x, y] = k.split(",").map(Number);
    const to = { x, y };
    const value = score(to);
    if (value > best.score || (value === best.score && spent < best.spent)) best = { to, spent, score: value };
  }
  return { to: best.to, spent: best.spent };
}

/** Is the board one connected space? A fight is ruined by a wall of pillars. */
function connected(bf: Battlefield): boolean {
  const coverSet = new Set(bf.cover);
  const open = bf.w * bf.h - coverSet.size;
  const seen = new Set<string>([key(bf.player)]);
  const queue = [bf.player];
  while (queue.length) {
    const s = queue.shift()!;
    for (const n of neighbours(s)) {
      if (!walkable(bf, n, coverSet) || seen.has(key(n))) continue;
      seen.add(key(n));
      queue.push(n);
    }
  }
  return seen.size === open;
}

/**
 * Lays out a fresh arena: the player on the left, the enemy on the right, and a
 * scatter of pillars in between that never walls the two sides apart.
 */
export function createBattlefield(rng: Rng = Math.random, opts: { ally?: boolean } = {}): Battlefield {
  const mid = Math.floor(BOARD.h / 2);
  const base: Battlefield = {
    ...BOARD,
    cover: [],
    player: { x: 2, y: mid },
    ally: opts.ally ? { x: 1, y: mid } : null,
    enemy: { x: BOARD.w - 3, y: mid },
  };
  const spawns = new Set(occupied(base).flatMap((s) => [key(s), ...neighbours(s).map(key)]));

  for (let attempt = 0; attempt < 12; attempt++) {
    const cover = new Set<string>();
    const wanted = 6 + Math.floor(rng() * 4);
    for (let i = 0; i < wanted * 6 && cover.size < wanted; i++) {
      const s = { x: 2 + Math.floor(rng() * (BOARD.w - 4)), y: Math.floor(rng() * BOARD.h) };
      if (!spawns.has(key(s))) cover.add(key(s));
    }
    const bf = { ...base, cover: [...cover] };
    if (connected(bf)) return bf;
  }
  return base; // vanishingly rare: an empty arena beats a broken one
}
