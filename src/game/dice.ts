/** Random source returning [0, 1). Injected so combat can be tested deterministically. */
export type Rng = () => number;

export const roll = (sides: number, rng: Rng): number => Math.floor(rng() * sides) + 1;

export function rollDice(count: number, sides: number, rng: Rng): number {
  let total = 0;
  for (let i = 0; i < count; i++) total += roll(sides, rng);
  return total;
}

export const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));

let idCounter = 0;
export function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${(++idCounter).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Small stable hash (FNV-1a) — used for image seeds so a place always gets the same picture. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 1_000_000;
}
