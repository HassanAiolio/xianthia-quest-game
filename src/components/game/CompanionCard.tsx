import { useState } from "react";
import { HeartPulse, Sparkles, Sword, UserMinus } from "lucide-react";
import type { Companion, CompanionRole } from "@/types/game";
import { VitalBar } from "@/components/game/VitalBar";
import { ROLE_LABEL, ROLE_TEXT } from "@/game/companions";
import { useGameStore } from "@/hooks/useGameStore";
import { cn } from "@/lib/utils";

const ROLE_ICON: Record<CompanionRole, typeof Sword> = { fighter: Sword, healer: HeartPulse, mystic: Sparkles };

export function CompanionCard({ companion }: { companion: Companion }) {
  const { state, dismissCompanion } = useGameStore();
  const [confirm, setConfirm] = useState(false);
  const Icon = ROLE_ICON[companion.role];
  const inCombat = state.gameState === "COMBAT";

  return (
    <section
      aria-label={`Companion: ${companion.name}`}
      className={cn("rounded-lg border bg-black/20 p-3", companion.down ? "border-destructive/40" : "border-[var(--gold)]/25")}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex min-w-0 items-center gap-1.5 text-[10px] uppercase tracking-wider text-[var(--gold)]">
          <Icon className="h-3 w-3 shrink-0" /> {ROLE_LABEL[companion.role]}
        </h3>
        {companion.down && <span className="shrink-0 text-[10px] uppercase tracking-wider text-destructive">Down until you rest</span>}
      </div>
      <div className="mt-0.5 font-display text-sm">{companion.name}</div>
      <p className="mt-0.5 line-clamp-2 text-[11px] leading-tight text-muted-foreground" title={companion.description}>
        {companion.description || ROLE_TEXT[companion.role]}
      </p>
      <div className="mt-2">
        <VitalBar label="Ally HP" value={companion.hp} max={companion.maxHp} variant="hp" showChanges delay={0.65} />
      </div>
      {!inCombat && (
        <button
          type="button"
          onClick={() => (confirm ? dismissCompanion() : setConfirm(true))}
          onBlur={() => setConfirm(false)}
          className="mt-2 inline-flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-destructive"
        >
          <UserMinus className="h-3 w-3" />
          {confirm ? "Click again to part ways" : "Part ways"}
        </button>
      )}
    </section>
  );
}
