import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, Dices, Sparkles, Volume2, WifiOff } from "lucide-react";
import { speak, stopVoice, useVoiceState } from "@/audio/voice";
import { sound } from "@/audio/sound";
import type { LogMessage } from "@/types/game";
import { cn } from "@/lib/utils";

const CHARS_PER_SECOND = 220;

/** Reveals fresh narration progressively; click to skip. Screen readers get the full text at once. */
function Typewriter({ text }: { text: string }) {
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = useState(reduceMotion ? text.length : 0);
  const skipped = useRef(false);

  useEffect(() => {
    if (reduceMotion) return setShown(text.length);
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const n = skipped.current ? text.length : Math.min(text.length, Math.floor(((now - start) / 1000) * CHARS_PER_SECOND));
      setShown(n);
      if (n < text.length) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [text, reduceMotion]);

  const typing = shown < text.length;
  return (
    <>
      <span aria-hidden onClick={() => (skipped.current = true)} className={cn(typing && "cursor-pointer")}>
        {text.slice(0, shown)}
        {typing && <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse bg-cyan/70" />}
      </span>
      <span className="sr-only">{text}</span>
    </>
  );
}

function SystemLine({ m }: { m: LogMessage }) {
  if (m.tone === "roll") {
    return (
      <div className="flex gap-2 rounded-lg border border-dashed border-cyan/25 bg-black/30 px-3 py-2 font-mono text-[11px] leading-relaxed text-cyan/90">
        <Dices className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-label="Dice" />
        <div className="whitespace-pre-line">{m.text}</div>
      </div>
    );
  }
  if (m.tone === "error") {
    return (
      <div role="alert" className="mx-auto flex w-fit items-center gap-2 rounded-lg border border-destructive/40 bg-black/40 px-3 py-1.5 text-xs text-destructive">
        <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>{m.text}</span>
      </div>
    );
  }
  const Icon = m.tone === "reward" ? Sparkles : m.tone === "danger" ? AlertTriangle : null;
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-1.5 px-3 py-1 text-center text-xs",
        m.tone === "reward" && "font-medium text-[var(--gold)]",
        m.tone === "danger" && "font-medium uppercase tracking-wider text-destructive",
        (!m.tone || m.tone === "info") && "italic text-muted-foreground"
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />}
      <span>{m.text}</span>
    </div>
  );
}

/** Replay one line of narration with the narrator voice. */
function ReadAloud({ text }: { text: string }) {
  const voice = useVoiceState();
  if (voice.problem) return null;
  return (
    <button
      type="button"
      aria-label="Read aloud"
      title="Read aloud"
      onClick={() => {
        sound.unlock();
        stopVoice();
        speak(text, true);
      }}
      className="absolute right-1.5 top-1.5 rounded p-1 text-cyan/40 opacity-0 transition-opacity hover:text-cyan focus-visible:opacity-100 group-hover:opacity-100"
    >
      <Volume2 className="h-3.5 w-3.5" />
    </button>
  );
}

export function NarrativeLog({ log, playerName, thinking }: { log: LogMessage[]; playerName: string; thinking: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const mountedAt = useRef(Date.now());

  // Follow new content (including text that is still typing) unless the reader scrolled up.
  useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content) return;
    const follow = () => stickToBottom.current && el.scrollTo({ top: el.scrollHeight });
    const observer = new ResizeObserver(follow);
    observer.observe(content);
    follow();
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={scrollRef}
      onScroll={(e) => {
        const el = e.currentTarget;
        stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
      }}
      className="min-h-[140px] flex-1 overflow-y-auto px-4 py-4 sm:min-h-[240px]"
    >
      <div ref={contentRef} role="log" aria-live="polite" aria-label="Story" className="space-y-3">
        {log.length === 0 && <p className="py-8 text-center text-sm italic text-muted-foreground">Your story begins with a single action.</p>}
        {log.map((m) => (
          <motion.div key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
            {m.sender === "SYSTEM" ? (
              <SystemLine m={m} />
            ) : (
              <div
                className={cn(
                  "rounded-lg border px-3 py-2 text-sm leading-relaxed",
                  m.sender === "PLAYER" &&
                    "ml-10 border-[var(--gold)]/40 bg-[color-mix(in_oklch,var(--gold)_8%,transparent)] text-[oklch(0.95_0.08_88)]",
                  m.sender === "AI" && "group relative mr-10 border-cyan/30 bg-[color-mix(in_oklch,var(--cyan)_5%,transparent)] text-foreground"
                )}
              >
                {m.sender === "AI" && <ReadAloud text={m.text} />}
                <div className={cn("mb-0.5 text-[10px] uppercase tracking-wider", m.sender === "PLAYER" ? "text-[var(--gold)]" : "text-cyan")}>
                  {m.sender === "PLAYER" ? playerName : "Aether-Core"}
                </div>
                <div className="whitespace-pre-line">
                  {m.sender === "AI" && m.timestamp >= mountedAt.current ? <Typewriter text={m.text} /> : m.text}
                </div>
              </div>
            )}
          </motion.div>
        ))}
        <AnimatePresence>
          {thinking && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mr-10 flex items-center gap-2 rounded-lg border border-cyan/30 bg-[color-mix(in_oklch,var(--cyan)_5%,transparent)] px-3 py-2 text-sm italic text-muted-foreground"
            >
              <span className="flex gap-1" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-cyan"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                  />
                ))}
              </span>
              The world is reacting…
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
