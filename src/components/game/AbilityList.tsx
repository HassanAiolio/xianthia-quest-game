import { Lock, Sparkles } from "lucide-react";
import type { Player } from "@/types/game";
import { nextAbility, unlockedAbilities } from "@/game/abilities";
import { cn } from "@/lib/utils";

/** The class's kit: what's unlocked, what it costs, and what comes next. */
export function AbilityList({ player }: { player: Player }) {
  const abilities = unlockedAbilities(player);
  const upcoming = nextAbility(player);

  return (
    <section aria-label="Abilities" className="rounded-lg border border-cyan/20 bg-black/20 p-3">
      <h3 className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-cyan">
        <Sparkles className="h-3 w-3" /> Abilities
      </h3>
      <ul className="mt-1.5 space-y-2">
        {abilities.map((a) => (
          <li key={a.id}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-display text-sm text-foreground">{a.name}</span>
              <span className={cn("shrink-0 text-[10px]", player.mp >= a.mp ? "text-cyan" : "text-muted-foreground")}>{a.mp} MP</span>
            </div>
            <p className="text-[11px] leading-tight text-muted-foreground">{a.text}</p>
          </li>
        ))}
        {upcoming && (
          <li className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
            <Lock className="h-3 w-3 shrink-0" />
            {upcoming.name} — unlocks at level {upcoming.level}
          </li>
        )}
      </ul>
    </section>
  );
}
