import { Dices } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import type { PendingCheck } from "@/types/game";
import { STAT_NAMES } from "@/game/checks";
import { Hint } from "@/components/game/Hint";

/** The narrator asked for a roll: the player sees the target and throws the die themselves. */
export function CheckPrompt({ check, busy, onRoll }: { check: PendingCheck; busy: boolean; onRoll: () => void }) {
  // A natural 1 always fails and a 20 always succeeds, so the odds sit between 5% and 95%.
  const needed = Math.min(20, Math.max(2, check.dc - check.bonus));
  const odds = Math.round(((21 - needed) / 20) * 100);
  const sign = check.bonus >= 0 ? "+" : "";

  return (
    <>
      <Hint id="first-check">
        Risky actions are settled by dice, not by the storyteller. Your stats decide what you need — the one your class specialises in is
        the one you are best at. Throw it and the story follows the result.
      </Hint>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        role="group"
        aria-label="Ability check"
        className="mb-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--gold)]/50 bg-[color-mix(in_oklch,var(--gold)_10%,transparent)] p-3"
      >
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[var(--gold)]">The Aether-Core calls for a roll</div>
          <div className="font-display text-sm text-foreground">
            {STAT_NAMES[check.stat]} check — {check.attempt}
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
            {check.difficulty} · DC {check.dc} · your bonus {sign}
            {check.bonus} · you need {needed}+ on the die ({odds}%)
          </div>
        </div>
        <Button
          autoFocus
          onClick={onRoll}
          disabled={busy}
          className="h-11 shrink-0 gap-2 bg-gradient-to-r from-[var(--gold)] to-[oklch(0.92_0.18_90)] px-5 font-display tracking-wider text-[var(--gold-foreground)] shadow-[var(--shadow-glow-gold)] hover:opacity-95"
        >
          <Dices className="h-4 w-4" /> {busy ? "Rolling…" : "Roll the d20"}
        </Button>
      </motion.div>
    </>
  );
}
