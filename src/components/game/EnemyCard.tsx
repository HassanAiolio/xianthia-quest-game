import { Skull } from "lucide-react";
import type { Enemy } from "@/types/game";
import { GameImage } from "@/components/game/GameImage";
import { VitalBar } from "@/components/game/VitalBar";
import { TIERS } from "@/game/enemies";
import { enemyUrl } from "@/services/imageService";
import { cn } from "@/lib/utils";

/** Small-screen version, shown above the log so the foe stays in view (lg+ uses the full card). */
export function EnemyStrip({ enemy }: { enemy: Enemy }) {
  return (
    <section
      aria-label={`Enemy: ${enemy.name}`}
      className="flex animate-fade-up items-center gap-3 rounded-2xl border border-destructive/50 bg-[color-mix(in_oklch,var(--destructive)_10%,transparent)] p-3 lg:hidden"
    >
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-destructive/40 bg-black/40">
        <GameImage src={enemyUrl(enemy)} alt="" fallback={<Skull className="h-6 w-6 text-destructive/50" />} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="truncate font-display text-sm text-destructive">{enemy.name}</h2>
          <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
            {TIERS[enemy.tier].label} · AC {enemy.ac}
          </span>
        </div>
        <div className="mt-1.5">
          <VitalBar label="Enemy HP" value={enemy.hp} max={enemy.maxHp} variant="hp" />
        </div>
      </div>
    </section>
  );
}

export function EnemyCard({ enemy }: { enemy: Enemy }) {
  const src = enemyUrl(enemy);
  const isBoss = enemy.tier === "boss";

  return (
    <section
      aria-label={`Enemy: ${enemy.name}`}
      className="hidden shrink-0 animate-fade-up flex-col rounded-xl lg:flex border border-destructive/50 bg-[color-mix(in_oklch,var(--destructive)_10%,transparent)] p-4 shadow-[0_0_24px_color-mix(in_oklch,var(--destructive)_20%,transparent)]"
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="animate-pulse text-xs font-bold uppercase tracking-[0.3em] text-destructive">Combat</span>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider",
            isBoss ? "border-[var(--gold)]/60 text-[var(--gold)]" : "border-destructive/50 text-destructive"
          )}
        >
          {TIERS[enemy.tier].label} · Lv {enemy.level}
        </span>
      </div>
      <div className="relative mb-4 aspect-square overflow-hidden rounded-xl border border-destructive/40 bg-black/40">
        <GameImage src={src} alt={enemy.name} fallback={<Skull className="h-14 w-14 text-destructive/50" />} />
        <div className="scanlines pointer-events-none absolute inset-0 z-10 opacity-50" />
      </div>
      <h2 className="mb-3 text-center font-display text-xl text-destructive drop-shadow-md">{enemy.name}</h2>
      <VitalBar label="Enemy HP" value={enemy.hp} max={enemy.maxHp} variant="hp" />
      <div className="mt-2 text-center text-[10px] uppercase tracking-wider text-muted-foreground">Armor Class {enemy.ac}</div>
    </section>
  );
}
