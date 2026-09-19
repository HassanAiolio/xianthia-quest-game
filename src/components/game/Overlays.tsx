import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpCircle, Skull, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGameStore } from "@/hooks/useGameStore";

function EndScreen({ icon, title, body, actions }: { icon: React.ReactNode; title: string; body: string; actions: React.ReactNode }) {
  const firstAction = useRef<HTMLDivElement>(null);
  useEffect(() => firstAction.current?.querySelector("button")?.focus(), []);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="end-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
    >
      <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="glass-strong max-w-md rounded-2xl p-8 text-center">
        {icon}
        <h2 id="end-title" className="text-gradient-gold mt-4 font-display text-3xl">
          {title}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
        <div ref={firstAction} className="mt-6 flex flex-wrap justify-center gap-3">
          {actions}
        </div>
      </motion.div>
    </motion.div>
  );
}

export function EndOverlays() {
  const { state, reset, setGameState } = useGameStore();
  const player = state.player!;
  const forgeAnew = () => {
    reset();
    setGameState("CHARACTER_CREATION");
  };

  return (
    <AnimatePresence>
      {state.gameState === "GAMEOVER" && (
        <EndScreen
          key="over"
          icon={<Skull className="mx-auto h-12 w-12 text-destructive" />}
          title="The Rift Claims You"
          body={`Your story ends here, ${player.name}. But the Rift remembers.`}
          actions={
            <>
              <Button onClick={forgeAnew} className="bg-gradient-to-r from-[var(--gold)] to-[var(--cyan)] text-[var(--gold-foreground)]">
                Forge anew
              </Button>
              <Button variant="outline" onClick={reset}>
                Return to the gates
              </Button>
            </>
          }
        />
      )}
      {state.gameState === "VICTORY" && (
        <EndScreen
          key="victory"
          icon={<Trophy className="mx-auto h-12 w-12 text-[var(--gold)]" />}
          title="Chronicle 0 Complete"
          body={`${player.name} reclaimed their name and broke the Hollow Regent's hold on time. Level ${player.level}. Xianthia's clocks begin to turn again.`}
          actions={
            <>
              <Button onClick={() => setGameState("PLAYING")} className="bg-gradient-to-r from-[var(--gold)] to-[var(--cyan)] text-[var(--gold-foreground)]">
                Keep exploring
              </Button>
              <Button variant="outline" onClick={forgeAnew}>
                Forge anew
              </Button>
            </>
          }
        />
      )}
    </AnimatePresence>
  );
}

/** Brief banner when the level goes up during play (not on load). */
export function LevelUpToast({ level }: { level: number }) {
  const previous = useRef(level);
  const [shownLevel, setShownLevel] = useState<number | null>(null);

  useEffect(() => {
    if (level > previous.current) {
      setShownLevel(level);
      const t = setTimeout(() => setShownLevel(null), 3200);
      previous.current = level;
      return () => clearTimeout(t);
    }
    previous.current = level;
  }, [level]);

  return (
    <AnimatePresence>
      {shownLevel !== null && (
        <motion.div
          role="status"
          initial={{ opacity: 0, y: -24, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12 }}
          className="pointer-events-none fixed inset-x-0 top-6 z-50 mx-auto flex w-fit items-center gap-3 rounded-2xl border border-[var(--gold)]/60 bg-black/80 px-6 py-3 shadow-[var(--shadow-glow-gold)] backdrop-blur"
        >
          <ArrowUpCircle className="h-7 w-7 text-[var(--gold)]" />
          <div>
            <div className="text-gradient-gold font-display text-xl">Level {shownLevel}</div>
            <div className="text-xs text-muted-foreground">Fully restored · spend your new stat point</div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
