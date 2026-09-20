import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, Dices, Minus, Plus, Sparkles, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GameImage } from "@/components/game/GameImage";
import { useGameStore } from "@/hooks/useGameStore";
import { useApiStatus } from "@/hooks/useApiStatus";
import { portraitUrl } from "@/services/imageService";
import {
  CLASS_DEFS,
  MAX_STAT,
  MIN_STAT,
  STARTING_POINTS,
  type CharacterClass,
  type GameDifficulty,
  type Stats,
} from "@/types/game";
import { makeLog } from "@/game/log";
import { DIFFICULTIES } from "@/game/difficulty";
import { baseMaxHp, baseMaxMp, mod } from "@/game/stats";
import { cn } from "@/lib/utils";

type Step = 0 | 1 | 2;

const STEP_LABELS = ["Identity", "Archetype", "Attributes"];

export function CharacterCreationView() {
  const { setGameState, startGame } = useGameStore();
  const apiStatus = useApiStatus();
  const [step, setStep] = useState<Step>(0);
  const [name, setName] = useState("");
  const [appearance, setAppearance] = useState("");
  const [difficulty, setDifficulty] = useState<GameDifficulty>("normal");
  const [chosenClass, setChosenClass] = useState<CharacterClass | null>(null);
  const [stats, setStats] = useState<Stats>({ str: 0, int: 0, dex: 0, lck: 0 });
  // Generated only on request: each portrait costs image credits.
  const [portrait, setPortrait] = useState<string | null>(null);

  const baseStats = useMemo(
    () => CLASS_DEFS.find((c) => c.id === chosenClass)?.baseStats,
    [chosenClass]
  );

  const spent = stats.str + stats.int + stats.dex + stats.lck;
  const remaining = STARTING_POINTS - spent;

  const nameValid = name.trim().length >= 2 && name.trim().length <= 24;
  const canProceed =
    (step === 0 && nameValid) ||
    (step === 1 && chosenClass !== null) ||
    (step === 2 && remaining === 0);

  function adjust(key: keyof Stats, delta: 1 | -1) {
    setStats((prev) => {
      const next = prev[key] + delta;
      if (next < 0) return prev;
      if (delta > 0 && remaining <= 0) return prev;
      const base = baseStats?.[key] ?? 0;
      if (base + next > MAX_STAT) return prev;
      if (base + next < MIN_STAT) return prev;
      return { ...prev, [key]: next };
    });
  }

  function finalize() {
    if (!chosenClass || !baseStats) return;
    const finalStats: Stats = {
      str: baseStats.str + stats.str,
      int: baseStats.int + stats.int,
      dex: baseStats.dex + stats.dex,
      lck: baseStats.lck + stats.lck,
    };
    const maxHp = baseMaxHp(finalStats);
    const maxMp = baseMaxMp(finalStats);

    startGame(
      {
        name: name.trim(),
        class: chosenClass,
        stats: finalStats,
        hp: maxHp,
        maxHp,
        mp: maxMp,
        maxMp,
        xp: 0,
        level: 1,
        portraitUrl: portrait ?? undefined,
        appearance: appearance.trim() || undefined,
        statPoints: 0,
      },
      [
        makeLog("SYSTEM", `${name.trim()} the ${chosenClass} awakens in the Obsidian Antechamber.`),
        makeLog(
          "AI",
          "You open your eyes. Cyan glyphs drift across walls of black glass. The air tastes of ozone and forgotten names. A single archway pulses ahead — what do you do?"
        ),
      ],
      difficulty
    );
  }

  function synthesizePortrait() {
    if (!chosenClass) return;
    setPortrait(portraitUrl(chosenClass, appearance, Math.floor(Math.random() * 1_000_000)));
  }

  const preview = baseStats && {
    str: baseStats.str + stats.str,
    int: baseStats.int + stats.int,
    dex: baseStats.dex + stats.dex,
    lck: baseStats.lck + stats.lck,
  };

  return (
    <div className="relative min-h-screen px-4 py-10 sm:px-8">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "var(--gradient-aurora)" }}
      />

      <div className="relative mx-auto max-w-5xl">
        {/* Back to landing */}
        <button
          onClick={() => setGameState("LANDING")}
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-cyan"
        >
          <ArrowLeft className="h-4 w-4" /> Return to gates
        </button>

        {/* Header */}
        <div className="mb-8 text-center">
          <p className="text-xs uppercase tracking-[0.4em] text-cyan">
            Character Sanctuary
          </p>
          <h1 className="text-gradient-gold mt-2 font-display text-4xl font-bold sm:text-5xl">
            Forge a Soul
          </h1>
        </div>

        {/* Stepper */}
        <div className="mb-10 flex items-center justify-center gap-3">
          {STEP_LABELS.map((label, i) => (
            <div key={label} className="flex items-center gap-3">
              <div
                className={cn(
                  "flex h-8 items-center gap-2 rounded-full border px-3 text-xs font-medium transition-all",
                  i === step
                    ? "border-[var(--gold)] bg-[color-mix(in_oklch,var(--gold)_15%,transparent)] text-[var(--gold)]"
                    : i < step
                      ? "border-cyan/40 text-cyan"
                      : "border-border text-muted-foreground"
                )}
              >
                <span className="font-display">{i + 1}</span>
                <span className="hidden sm:inline">{label}</span>
              </div>
              {i < STEP_LABELS.length - 1 && (
                <div className="h-px w-6 bg-border sm:w-12" />
              )}
            </div>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* Step content */}
          <div className="glass-strong min-h-[420px] rounded-2xl p-6 sm:p-8">
            <AnimatePresence mode="wait">
              {step === 0 && (
                <motion.div
                  key="step-0"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <div>
                    <h2 className="font-display text-2xl">Identity</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      What name will the Rift remember you by?
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="name">True Name</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Veyra of the Quiet Hour"
                      maxLength={24}
                      className="h-12 border-glass-border bg-[var(--input)] font-display text-lg tracking-wide placeholder:text-muted-foreground/50 focus-visible:ring-[var(--gold)]"
                    />
                    <p
                      className={cn(
                        "text-xs",
                        nameValid ? "text-cyan" : "text-muted-foreground"
                      )}
                    >
                      {name.trim().length === 0
                        ? "2–24 characters."
                        : nameValid
                          ? "Accepted."
                          : "Name too short."}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="appearance">Appearance <span className="text-muted-foreground">(optional)</span></Label>
                    <Input
                      id="appearance"
                      value={appearance}
                      onChange={(e) => setAppearance(e.target.value)}
                      placeholder="e.g. scarred face, white hair, cybernetic eye..."
                      maxLength={80}
                      className="h-11 border-glass-border bg-[var(--input)] placeholder:text-muted-foreground/50 focus-visible:ring-[var(--gold)]"
                    />
                  </div>
                </motion.div>
              )}

              {step === 1 && (
                <motion.div
                  key="step-1"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <div>
                    <h2 className="font-display text-2xl">Archetype</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Choose what you were before the Rift took you.
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    {CLASS_DEFS.map((c) => {
                      const active = chosenClass === c.id;
                      return (
                        <button
                          key={c.id}
                          aria-pressed={active}
                          onClick={() => {
                            if (c.id !== chosenClass) setPortrait(null);
                            setChosenClass(c.id);
                          }}
                          className={cn(
                            "group relative flex h-full flex-col rounded-xl border p-4 text-left transition-all",
                            active
                              ? "border-[var(--gold)] bg-[color-mix(in_oklch,var(--gold)_10%,transparent)] shadow-[var(--shadow-glow-gold)]"
                              : "border-border bg-[var(--card)] hover:border-cyan/40 hover:bg-[color-mix(in_oklch,var(--cyan)_6%,var(--card))]"
                          )}
                        >
                          <span className="font-display text-base text-foreground">
                            {c.id}
                          </span>
                          <span className="mt-0.5 text-xs uppercase tracking-wider text-cyan">
                            {c.tagline}
                          </span>
                          <p className="mt-3 text-xs text-muted-foreground">
                            {c.description}
                          </p>
                          <div className="mt-4 grid grid-cols-4 gap-1 text-center text-[10px] uppercase tracking-wider text-muted-foreground">
                            {(["str", "int", "dex", "lck"] as const).map((s) => (
                              <div key={s} className="rounded bg-black/20 py-1">
                                <div>{s}</div>
                                <div className="font-display text-sm text-foreground">
                                  {c.baseStats[s]}
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="mt-3 inline-flex items-center gap-1 text-[10px] text-[var(--gold)]">
                            <Sparkles className="h-3 w-3" /> {c.signature}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div
                  key="step-2"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <div className="flex items-end justify-between">
                    <div>
                      <h2 className="font-display text-2xl">Attributes</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Spend all {STARTING_POINTS} points to continue.
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">
                        Remaining
                      </div>
                      <div
                        className={cn(
                          "font-display text-3xl",
                          remaining === 0 ? "text-cyan" : "text-[var(--gold)]"
                        )}
                      >
                        {remaining}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {(
                      [
                        { k: "str", label: "Strength", hint: "Damage, HP" },
                        { k: "int", label: "Intellect", hint: "Spells, MP" },
                        { k: "dex", label: "Dexterity", hint: "Speed, evasion" },
                        { k: "lck", label: "Luck", hint: "Crits, fortune" },
                      ] as const
                    ).map(({ k, label, hint }) => {
                      const base = baseStats?.[k] ?? 0;
                      const added = stats[k];
                      const total = base + added;
                      return (
                        <div
                          key={k}
                          className="flex items-center justify-between rounded-lg border border-border bg-[var(--card)] p-3"
                        >
                          <div>
                            <div className="font-display text-sm">{label}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {hint}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-8 border-border"
                              onClick={() => adjust(k, -1)}
                              disabled={added === 0}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <div className="w-16 text-center">
                              <div className="font-display text-2xl text-foreground">
                                {total}
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                {base}
                                {added > 0 ? ` + ${added}` : ""}
                              </div>
                            </div>
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-8 border-border"
                              onClick={() => adjust(k, 1)}
                              disabled={remaining === 0 || total >= MAX_STAT}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {preview && (
                    <div className="grid grid-cols-3 gap-2 text-center" aria-live="polite">
                      {[
                        { label: "Max HP", value: baseMaxHp(preview), hint: "30 + 3 per STR" },
                        { label: "Max MP", value: baseMaxMp(preview), hint: "20 + 3 per INT" },
                        { label: "Armor", value: 10 + mod(preview.dex), hint: "10 + DEX bonus" },
                      ].map((d) => (
                        <div key={d.label} className="rounded-lg border border-cyan/20 bg-black/20 p-2">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{d.label}</div>
                          <div className="font-display text-xl text-cyan">{d.value}</div>
                          <div className="text-[10px] text-muted-foreground">{d.hint}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  <fieldset>
                    <legend className="text-xs uppercase tracking-wider text-muted-foreground">How hard should Xianthia be?</legend>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      {Object.values(DIFFICULTIES).map((d) => {
                        const active = difficulty === d.id;
                        return (
                          <button
                            key={d.id}
                            type="button"
                            aria-pressed={active}
                            onClick={() => setDifficulty(d.id)}
                            className={cn(
                              "rounded-xl border p-3 text-left transition-all",
                              active
                                ? "border-[var(--gold)] bg-[color-mix(in_oklch,var(--gold)_10%,transparent)] shadow-[var(--shadow-glow-gold)]"
                                : "border-border bg-[var(--card)] hover:border-cyan/40"
                            )}
                          >
                            <span className="font-display text-sm text-foreground">{d.label}</span>
                            <p className="mt-1 text-[11px] leading-tight text-muted-foreground">{d.blurb}</p>
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* AI Portrait placeholder */}
          <div className="glass-strong rounded-2xl p-4">
            <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
              AI Portrait
            </div>
            
            <div className="relative mt-3 aspect-[3/4] overflow-hidden rounded-xl border border-glass-border bg-gradient-to-br from-[oklch(0.18_0.04_270)] to-[oklch(0.12_0.03_290)]">
              <GameImage
                src={portrait}
                alt={`Portrait of ${name.trim() || "your character"}`}
                fallback={
                  <div className="flex flex-col items-center gap-3 px-4 text-center">
                    <User className="h-12 w-12 text-cyan/40" />
                    <span className="text-xs text-muted-foreground">
                      {apiStatus?.images === false
                        ? "Image generation is off (no HF_TOKEN on the server)."
                        : portrait
                          ? "Synthesizing portrait… (about 10 seconds)"
                          : chosenClass
                            ? "Describe your look, then synthesize a portrait."
                            : "Choose an archetype to synthesize a portrait."}
                    </span>
                  </div>
                }
              />
              <div className="absolute inset-0 scanlines opacity-40 z-10 pointer-events-none" />

              {/* Decorative Borders */}
              <div className="absolute inset-x-0 top-0 h-px z-20" style={{ background: "var(--gradient-cyan)" }} />
              <div className="absolute inset-x-0 bottom-0 h-px z-20" style={{ background: "var(--gradient-gold)" }} />
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={synthesizePortrait}
              disabled={!chosenClass || apiStatus?.images === false}
              className="mt-3 w-full border-glass-border text-xs hover:border-cyan/50 hover:text-cyan"
            >
              {portrait ? <Dices className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
              {portrait ? "Reroll portrait" : "Synthesize portrait"}
            </Button>

            <div className="mt-3 space-y-1 text-xs text-muted-foreground">
              <div>
                <span className="text-foreground font-medium">Name:</span>{" "}
                {name.trim() || "—"}
              </div>
              <div>
                <span className="text-foreground font-medium">Class:</span>{" "}
                {chosenClass ?? "—"}
              </div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <div className="mt-6 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => (s > 0 ? ((s - 1) as Step) : s))}
            disabled={step === 0}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>

          {step < 2 ? (
            <Button
              onClick={() => canProceed && setStep((s) => (s + 1) as Step)}
              disabled={!canProceed}
              className="bg-gradient-to-r from-[var(--gold)] to-[oklch(0.92_0.18_90)] font-display tracking-wider text-[var(--gold-foreground)] hover:opacity-95"
            >
              Continue <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={finalize}
              disabled={!canProceed}
              className="bg-gradient-to-r from-[var(--gold)] to-[var(--cyan)] font-display tracking-wider text-[var(--gold-foreground)] shadow-[var(--shadow-glow-gold)] hover:opacity-95"
            >
              Enter Xianthia <Sparkles className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
