import { useCallback, useSyncExternalStore } from "react";

/**
 * One-time tips for a first-time player. Remembered per browser, not per save,
 * so starting a second character doesn't explain the basics all over again.
 */

const KEY = "xianthia-quest:hints";

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

let seen = load();
const listeners = new Set<() => void>();

/** Hide a tip because the player just did the thing it explains. */
export function dismissHint(id: string) {
  if (seen.has(id)) return;
  seen = new Set(seen).add(id);
  try {
    localStorage.setItem(KEY, JSON.stringify([...seen]));
  } catch {
    /* private mode: the tip simply shows again next visit */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useHint(id: string): { show: boolean; dismiss: () => void } {
  const show = useSyncExternalStore(
    subscribe,
    () => !seen.has(id),
    () => false
  );
  return { show, dismiss: useCallback(() => dismissHint(id), [id]) };
}
