import { useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ParticleField } from "@/components/game/ParticleField";
import { useGameStore } from "@/hooks/useGameStore";
import { useApiStatus } from "@/hooks/useApiStatus";
import { resumeState } from "@/game/save";

export function LandingView() {
  const { state, setGameState, resume } = useGameStore();
  const status = useApiStatus();
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const save = resumeState(state) ? state.player : null;

  function newJourney() {
    if (save && !confirmOverwrite) return setConfirmOverwrite(true);
    setGameState("CHARACTER_CREATION");
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-6">
      <ParticleField />
      <div className="pointer-events-none absolute inset-0" style={{ background: "var(--gradient-aurora)" }} />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1 }}
        className="relative z-10 flex flex-col items-center text-center"
      >
        <motion.p className="mb-6 text-xs uppercase tracking-[0.5em] text-cyan" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
          Chronicle 0 — The Rift Opens
        </motion.p>

        <motion.h1
          className="text-gradient-aurora font-display text-6xl font-black leading-none sm:text-7xl md:text-8xl"
          animate={{
            textShadow: ["0 0 30px rgba(255,200,80,0.3)", "0 0 60px rgba(120,220,255,0.45)", "0 0 30px rgba(255,200,80,0.3)"],
          }}
          transition={{ duration: 4, repeat: Infinity }}
        >
          Xianthia Quest
        </motion.h1>

        <motion.p className="mt-6 max-w-md text-base text-muted-foreground" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}>
          A story-driven RPG of broken time, neon ghosts, and the choices that build worlds.
        </motion.p>

        <motion.div className="mt-12 flex w-full max-w-xs flex-col gap-3" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}>
          {save && (
            <Button
              size="lg"
              className="h-auto min-h-12 flex-col gap-0 bg-gradient-to-r from-[var(--gold)] to-[oklch(0.92_0.18_90)] py-2 font-display text-base tracking-wider text-[var(--gold-foreground)] shadow-[var(--shadow-glow-gold)] transition-transform hover:scale-[1.02]"
              onClick={resume}
            >
              Continue
              <span className="font-sans text-[11px] font-medium normal-case tracking-normal opacity-80">
                {save.name} · Lv {save.level} {save.class}
              </span>
            </Button>
          )}
          <Button
            size="lg"
            variant={save ? "outline" : "default"}
            onBlur={() => setConfirmOverwrite(false)}
            onClick={newJourney}
            className={
              save
                ? "h-12 border-[var(--glass-border)] bg-[var(--glass)] font-display tracking-wider backdrop-blur-md hover:bg-[var(--glass)] hover:text-cyan"
                : "h-12 bg-gradient-to-r from-[var(--gold)] to-[oklch(0.92_0.18_90)] font-display text-base tracking-wider text-[var(--gold-foreground)] shadow-[var(--shadow-glow-gold)] transition-transform hover:scale-[1.02]"
            }
          >
            {confirmOverwrite ? `Erase ${save?.name}'s journey?` : "New Journey"}
          </Button>
        </motion.div>

        {!save && (
          <motion.ul
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.1 }}
            className="mt-10 max-w-md space-y-1.5 text-left text-xs text-muted-foreground"
          >
            <li>· Type whatever you want to do. There is no command list.</li>
            <li>· Risky attempts come down to a die you roll yourself.</li>
            <li>· Fights, loot and levels are run by real rules — the story just tells you about them.</li>
          </motion.ul>
        )}

        {status && !status.llm && (
          <p role="alert" className="mt-8 flex max-w-sm items-start gap-2 rounded-lg border border-destructive/40 bg-black/40 p-3 text-left text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {status.reachable
              ? "The narrator is offline: GROQ_API_KEY is not set on the server."
              : "The game server can't be reached, so the narrator is offline. Try again in a moment."}
          </p>
        )}
      </motion.div>

      <motion.p className="absolute bottom-6 text-xs text-muted-foreground/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}>
        v0.2 — Chronicle 0
      </motion.p>
    </div>
  );
}
