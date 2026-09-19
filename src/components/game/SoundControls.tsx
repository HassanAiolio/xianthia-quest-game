import { useEffect, useRef, useState } from "react";
import { Mic, Music, Volume2, VolumeX, Waves } from "lucide-react";
import { updateAudioSettings, useAudioSettings, type AudioSettings } from "@/audio/settings";
import { sound } from "@/audio/sound";
import { useVoiceState } from "@/audio/voice";
import { cn } from "@/lib/utils";

const TOGGLES: { key: keyof Pick<AudioSettings, "music" | "sfx" | "voice">; label: string; icon: typeof Music; hint: string }[] = [
  { key: "music", label: "Music", icon: Music, hint: "Ambient soundtrack that follows exploration and combat" },
  { key: "sfx", label: "Sound effects", icon: Waves, hint: "Dice, hits, rewards" },
  { key: "voice", label: "Narrator voice", icon: Mic, hint: "The Aether-Core reads its lines aloud" },
];

export function SoundControls() {
  const settings = useAudioSettings();
  const voice = useVoiceState();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const silent = settings.volume === 0 || (!settings.music && !settings.sfx && !settings.voice);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label="Sound settings"
        aria-expanded={open}
        onClick={() => {
          sound.unlock();
          setOpen((o) => !o);
        }}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/5 hover:text-cyan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
      >
        {silent ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>
      {open && (
        <div role="group" aria-label="Sound settings" className="absolute right-0 top-9 z-30 w-64 rounded-xl border border-glass-border bg-[var(--popover)] p-3 shadow-[var(--shadow-card)]">
          {TOGGLES.map(({ key, label, icon: Icon, hint }) => (
            <button
              key={key}
              type="button"
              role="switch"
              aria-checked={settings[key]}
              onClick={() => {
                sound.unlock();
                updateAudioSettings({ [key]: !settings[key] });
              }}
              title={hint}
              className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-xs hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
            >
              <span className="flex items-center gap-2">
                <Icon className="h-3.5 w-3.5 text-cyan" /> {label}
              </span>
              <span className={cn("relative h-4 w-7 rounded-full transition-colors", settings[key] ? "bg-cyan/70" : "bg-white/15")}>
                <span className={cn("absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all", settings[key] ? "left-3.5" : "left-0.5")} />
              </span>
            </button>
          ))}
          {voice.problem && settings.voice && <p className="px-2 pb-1 text-[11px] leading-snug text-destructive">{voice.problem}</p>}
          <label className="mt-2 block px-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            Volume
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.volume}
              onChange={(e) => updateAudioSettings({ volume: Number(e.target.value) })}
              className="mt-1 w-full accent-[var(--cyan)]"
            />
          </label>
        </div>
      )}
    </div>
  );
}
