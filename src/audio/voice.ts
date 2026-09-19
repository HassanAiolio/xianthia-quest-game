import { useSyncExternalStore } from "react";
import { getAudioSettings, subscribeAudioSettings } from "./settings";
import { sound } from "./sound";

/** Narrator voice: queued text-to-speech through /api/tts, with the music ducked while it speaks. */

export interface VoiceState {
  status: "idle" | "loading" | "speaking";
  /** Set when the server can't provide a voice (e.g. model terms not accepted); speaking stops until reload. */
  problem: string | null;
}

let state: VoiceState = { status: "idle", problem: null };
const listeners = new Set<() => void>();
const queue: string[] = [];
let current: HTMLAudioElement | null = null;
let pumping = false;
let generation = 0;

function set(patch: Partial<VoiceState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function useVoiceState(): VoiceState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state
  );
}

/** Queue a line of narration. `force` plays it even when auto-voice is off (the replay button). */
export function speak(text: string, force = false) {
  if ((!getAudioSettings().voice && !force) || state.problem || !text.trim()) return;
  queue.push(text);
  void pump();
}

/** Stop talking now (the player moved on, or turned the voice off). */
export function stopVoice() {
  generation++;
  queue.length = 0;
  current?.pause();
  current = null;
  sound.duck(false);
  set({ status: "idle" });
}

subscribeAudioSettings(() => {
  if (!getAudioSettings().voice) stopVoice();
});

async function pump() {
  if (pumping) return;
  pumping = true;
  const gen = generation;
  try {
    while (queue.length && gen === generation) {
      const text = queue.shift()!;
      set({ status: "loading" });
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      }).catch(() => null);
      if (gen !== generation) break;
      if (!res?.ok) {
        const body = await res?.json().catch(() => ({}));
        // Configuration problems won't fix themselves: stop trying this session.
        if (!res || res.status === 503 || res.status === 404) set({ problem: body?.error ?? "The narrator's voice is unavailable." });
        queue.length = 0;
        break;
      }
      const url = URL.createObjectURL(await res.blob());
      await play(url, gen);
      URL.revokeObjectURL(url);
    }
  } finally {
    pumping = false;
    if (gen === generation) set({ status: "idle" });
  }
}

function play(url: string, gen: number): Promise<void> {
  return new Promise((resolve) => {
    if (gen !== generation) return resolve();
    const audio = new Audio(url);
    audio.volume = Math.min(1, getAudioSettings().volume + 0.2);
    current = audio;
    const done = () => {
      if (current === audio) current = null;
      sound.duck(false);
      resolve();
    };
    audio.onended = done;
    audio.onerror = done;
    audio.onpause = done;
    sound.duck(true);
    set({ status: "speaking" });
    audio.play().catch(done);
  });
}
