import { useSyncExternalStore } from "react";

export interface AudioSettings {
  music: boolean;
  sfx: boolean;
  /** Narrator voice (text-to-speech). Off by default: it spends API quota. */
  voice: boolean;
  /** Master volume 0..1. */
  volume: number;
}

const KEY = "xianthia-quest:audio";
const DEFAULTS: AudioSettings = { music: true, sfx: true, voice: false, volume: 0.6 };

function load(): AudioSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

let current = load();
const listeners = new Set<() => void>();

export function getAudioSettings(): AudioSettings {
  return current;
}

export function updateAudioSettings(patch: Partial<AudioSettings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* private mode: settings last for this visit only */
  }
  listeners.forEach((l) => l());
}

export function subscribeAudioSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAudioSettings(): AudioSettings {
  return useSyncExternalStore(subscribeAudioSettings, getAudioSettings, getAudioSettings);
}
