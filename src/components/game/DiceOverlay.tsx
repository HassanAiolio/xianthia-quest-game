import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { DiceRoll, LogMessage } from "@/types/game";
import { cn } from "@/lib/utils";

export const DICE_SPIN_MS = 650;
/** A die the player threw themselves gets a proper tumble. */
export const MANUAL_SPIN_MS = 1900;
const HOLD_MS = 750;

/** Good or bad from the player's point of view (an enemy's miss is good news). */
export function isGoodRoll(d: DiceRoll): boolean {
  const passed = d.outcome === "success" || d.outcome === "critical";
  return d.who === "enemy" ? !passed : passed;
}

function verdict(d: DiceRoll): string {
  if (d.kind === "escape") return d.outcome === "success" || d.outcome === "critical" ? "Escaped" : "Caught";
  if (d.who === "enemy") return d.outcome === "critical" ? "Crits you" : d.outcome === "success" ? "Hits you" : "Misses";
  if (d.kind === "check") return { critical: "Critical!", success: "Success", failure: "Failure", fumble: "Disaster" }[d.outcome];
  return { critical: "Critical hit!", success: "Hit", failure: "Miss", fumble: "Fumble" }[d.outcome];
}

function D20({ face, spinning, className }: { face: number; spinning: boolean; className?: string }) {
  return (
    <motion.div
      className={cn("relative h-14 w-14 shrink-0", className)}
      animate={spinning ? { rotate: [0, 120, 240, 360], scale: [1, 1.08, 0.96, 1] } : { rotate: 0, scale: [1.25, 1] }}
      transition={spinning ? { duration: 0.45, repeat: Infinity, ease: "linear" } : { type: "spring", stiffness: 400, damping: 12 }}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
        <polygon points="50,3 93,27 93,73 50,97 7,73 7,27" className="fill-black/60 stroke-current" strokeWidth="4" strokeLinejoin="round" />
        <polygon points="50,24 76,68 24,68" className="fill-none stroke-current opacity-60" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M50 3 L50 24 M93 27 L76 68 M93 73 L76 68 M50 97 L76 68 M50 97 L24 68 M7 73 L24 68 M7 27 L24 68 M7 27 L50 24 M93 27 L50 24" className="stroke-current opacity-30" strokeWidth="2" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center pt-1.5 font-display text-lg font-bold tabular-nums">{face}</span>
    </motion.div>
  );
}

interface Current {
  key: number;
  die: DiceRoll;
  landed: boolean;
  face: number;
}

/**
 * Animates fresh d20 rolls one after another over the story log.
 * Decorative: the log line already carries the same result in text, so this is aria-hidden.
 */
export function DiceOverlay({ log, onRoll, onLand }: { log: LogMessage[]; onRoll?: () => void; onLand?: (d: DiceRoll) => void }) {
  const reduceMotion = useReducedMotion();
  const mountedAt = useRef(Date.now());
  const seen = useRef(new Set<string>());
  const counter = useRef(0);
  const callbacks = useRef({ onRoll, onLand });
  callbacks.current = { onRoll, onLand };
  const [queue, setQueue] = useState<DiceRoll[]>([]);
  const [current, setCurrent] = useState<Current | null>(null);
  const currentRef = useRef(current);
  currentRef.current = current;

  useEffect(() => {
    const fresh: DiceRoll[] = [];
    for (const m of log) {
      if (m.tone !== "roll" || !m.dice?.length || seen.current.has(m.id)) continue;
      seen.current.add(m.id);
      if (m.timestamp >= mountedAt.current) fresh.push(...m.dice);
    }
    if (fresh.length) setQueue((q) => [...q, ...fresh]);
  }, [log]);

  useEffect(() => {
    if (current || queue.length === 0) return;
    const [die, ...rest] = queue;
    setQueue(rest);
    setCurrent({ key: ++counter.current, die, landed: Boolean(reduceMotion), face: reduceMotion ? die.natural : 1 + Math.floor(Math.random() * 20) });
    callbacks.current.onRoll?.();
    if (reduceMotion) callbacks.current.onLand?.(die);
  }, [queue, current, reduceMotion]);

  const key = current?.key;
  const landed = current?.landed;
  useEffect(() => {
    if (key === undefined) return;
    if (!landed) {
      const flicker = setInterval(() => setCurrent((c) => (c && !c.landed ? { ...c, face: 1 + Math.floor(Math.random() * 20) } : c)), 60);
      const spinMs = currentRef.current?.die.manual ? MANUAL_SPIN_MS : DICE_SPIN_MS;
      const land = setTimeout(() => {
        clearInterval(flicker);
        // Side effects stay out of the state updater (StrictMode may run updaters twice).
        if (currentRef.current) callbacks.current.onLand?.(currentRef.current.die);
        setCurrent((c) => (c ? { ...c, landed: true, face: c.die.natural } : c));
      }, spinMs);
      return () => {
        clearInterval(flicker);
        clearTimeout(land);
      };
    }
    const hold = setTimeout(() => setCurrent(null), HOLD_MS);
    return () => clearTimeout(hold);
  }, [key, landed]);

  const d = current?.die;
  const good = d ? isGoodRoll(d) : false;
  const tone = !d || !current?.landed ? "text-cyan" : d.outcome === "critical" && good ? "text-[var(--gold)]" : good ? "text-cyan" : "text-destructive";

  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-12 z-20 flex justify-center">
      <AnimatePresence>
        {current && d && (
          <motion.div
            key={current.key}
            initial={{ opacity: 0, y: -10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.95 }}
            transition={{ duration: 0.18 }}
            className={cn(
              "flex items-center gap-3 rounded-2xl border bg-black/80 px-4 py-2.5 shadow-lg backdrop-blur-md",
              current.landed && d.outcome === "critical" && good ? "border-[var(--gold)]/70 shadow-[var(--shadow-glow-gold)]" : "border-glass-border"
            )}
          >
            <D20 face={current.face} spinning={!current.landed} className={tone} />
            <div className="min-w-[9rem]">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{d.label}</div>
              {current.landed ? (
                <>
                  <div className="font-mono text-xs text-foreground/80">
                    {d.natural} {d.bonus >= 0 ? "+" : "−"} {Math.abs(d.bonus)} = {d.natural + d.bonus} vs {d.kind === "attack" ? "AC" : "DC"} {d.target}
                  </div>
                  <div className={cn("font-display text-sm uppercase tracking-wider", tone)}>{verdict(d)}</div>
                </>
              ) : (
                <div className="font-display text-sm uppercase tracking-wider text-muted-foreground">Rolling…</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
