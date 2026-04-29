import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ParticleField } from "@/components/game/ParticleField";
import { useGameStore } from "@/hooks/useGameStore";

export function LandingView() {
  const { state, setGameState } = useGameStore();
  const hasSave = state.player !== null && state.gameState !== "LANDING";

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-6">
      <ParticleField />

      {/* Aurora bg */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "var(--gradient-aurora)" }}
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1 }}
        className="relative z-10 flex flex-col items-center text-center"
      >
        <motion.p
          className="mb-6 text-xs uppercase tracking-[0.5em] text-cyan"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          Chronicle 0 — The Rift Opens
        </motion.p>

        <motion.h1
          className="text-gradient-aurora font-display text-6xl font-black leading-none sm:text-7xl md:text-8xl"
          animate={{
            textShadow: [
              "0 0 30px rgba(255,200,80,0.3)",
              "0 0 60px rgba(120,220,255,0.45)",
              "0 0 30px rgba(255,200,80,0.3)",
            ],
          }}
          transition={{ duration: 4, repeat: Infinity }}
        >
          Xianthia Quest
        </motion.h1>

        <motion.p
          className="mt-6 max-w-md text-base text-muted-foreground"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
        >
          A story-driven RPG of broken time, neon ghosts, and the choices
          that build worlds.
        </motion.p>

        <motion.div
          className="mt-12 flex w-full max-w-xs flex-col gap-3"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
        >
          <Button
            size="lg"
            className="h-12 bg-gradient-to-r from-[var(--gold)] to-[oklch(0.92_0.18_90)] font-display text-base tracking-wider text-[var(--gold-foreground)] shadow-[var(--shadow-glow-gold)] transition-transform hover:scale-[1.02] hover:from-[var(--gold)] hover:to-[var(--gold)]"
            onClick={() => setGameState("CHARACTER_CREATION")}
          >
            New Journey
          </Button>
          <Button
            size="lg"
            variant="outline"
            disabled={!hasSave}
            className="h-12 border-[var(--glass-border)] bg-[var(--glass)] font-display tracking-wider backdrop-blur-md hover:bg-[var(--glass)] hover:text-cyan disabled:opacity-40"
            onClick={() => hasSave && setGameState("PLAYING")}
          >
            Continue {hasSave ? "" : "(no save)"}
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className="h-12 font-display tracking-wider text-muted-foreground hover:text-foreground"
          >
            Archives
          </Button>
        </motion.div>
      </motion.div>

      <motion.p
        className="absolute bottom-6 text-xs text-muted-foreground/60"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
      >
        v0.1 — Prologue Build
      </motion.p>
    </div>
  );
}
