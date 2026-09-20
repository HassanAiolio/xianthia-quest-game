import { useState } from "react";
import { Coins, LogOut, Plus, Shield, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CompanionCard } from "@/components/game/CompanionCard";
import { VitalBar } from "@/components/game/VitalBar";
import { GameImage } from "@/components/game/GameImage";
import { useGameStore } from "@/hooks/useGameStore";
import { classDef, type StatKey } from "@/types/game";
import { IN_GAME_STAT_CAP, effectiveStats, playerAC, xpToNext } from "@/game/stats";
import { checkBonus } from "@/game/checks";
import { cn } from "@/lib/utils";

const STAT_LABELS: Record<StatKey, string> = { str: "Strength", int: "Intellect", dex: "Dexterity", lck: "Luck" };

export function PlayerPanel({ className }: { className?: string }) {
  const { state, spendStatPoint, reset } = useGameStore();
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const player = state.player!;
  const cls = classDef(player.class);
  const effective = effectiveStats(player, state.inventory);

  return (
    <aside
      className={cn(
        "glass-strong order-2 flex min-h-0 flex-col gap-4 overflow-y-auto rounded-2xl p-4 lg:order-1 [&::-webkit-scrollbar]:hidden",
        className
      )}
    >
      {/* shrink-0: as a flex child this used to get squeezed into a sliver once the panel filled up. */}
      <div className="relative mx-auto aspect-[3/4] h-[38svh] w-[28.5svh] shrink-0 overflow-hidden rounded-xl border border-glass-border lg:h-auto lg:w-full bg-gradient-to-br from-[oklch(0.2_0.05_270)] to-[oklch(0.12_0.03_290)]">
        <GameImage src={player.portraitUrl} alt={`Portrait of ${player.name}`} fallback={<User className="h-20 w-20 text-cyan/60" />} />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
          <div className="font-display text-base leading-tight">{player.name}</div>
          <div className="text-[10px] uppercase tracking-wider text-cyan">
            Lv {player.level} · {player.class}
          </div>
        </div>
        <div className="scanlines pointer-events-none absolute inset-0 z-10 opacity-30" />
        <div className="absolute inset-x-0 top-0 z-20 h-px" style={{ background: "var(--gradient-cyan)" }} />
      </div>

      <div className="space-y-2.5">
        <VitalBar label="HP" value={player.hp} max={player.maxHp} variant="hp" showChanges delay={state.gameState === "COMBAT" ? 0.65 : 0} />
        <VitalBar label="MP" value={player.mp} max={player.maxMp} variant="mp" />
        <VitalBar label="XP" value={player.xp} max={xpToNext(player.level)} variant="xp" />
        <div className="flex items-center justify-between text-[11px]">
          <span className="inline-flex items-center gap-1 uppercase tracking-wider text-muted-foreground">
            <Coins className="h-3 w-3 text-[var(--gold)]" /> Shards
          </span>
          <span className="font-display text-sm text-[var(--gold)]">{state.shards}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-center">
        {(["str", "int", "dex", "lck"] as const).map((s) => {
          const bonus = effective[s] - player.stats[s];
          const canSpend = player.statPoints > 0 && player.stats[s] < IN_GAME_STAT_CAP;
          const check = checkBonus(player, state.inventory, s);
          const proficient = cls.primary === s;
          return (
            <div
              key={s}
              className="relative flex flex-col items-center justify-center rounded-lg border border-border bg-black/20 py-2"
              title={`${STAT_LABELS[s]} — ability checks ${check >= 0 ? "+" : ""}${check}${proficient ? " (class specialty)" : ""}`}
            >
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{s}</div>
              <div className="font-display text-lg text-foreground">
                {effective[s]}
                {bonus > 0 && <span className="ml-0.5 align-top text-[10px] text-cyan">+{bonus}</span>}
              </div>
              <div className={cn("text-[9px] tracking-wide", proficient ? "text-[var(--gold)]" : "text-muted-foreground")}>
                check {check >= 0 ? "+" : ""}
                {check}
                {proficient && " ★"}
              </div>
              {canSpend && (
                <button
                  onClick={() => spendStatPoint(s)}
                  aria-label={`Spend a point on ${STAT_LABELS[s]}`}
                  className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-gradient-to-br from-[var(--gold)] to-amber-600 text-[var(--gold-foreground)] shadow-[0_0_8px_var(--gold)] transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]"
                >
                  <Plus className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Shield className="h-3 w-3 text-cyan" /> Armor Class {playerAC(player, state.inventory)}
        </span>
        {player.statPoints > 0 && (
          <span className="animate-pulse font-bold uppercase tracking-wider text-[var(--gold)]">
            {player.statPoints} point{player.statPoints > 1 ? "s" : ""} to spend
          </span>
        )}
      </div>

      {state.companion && <CompanionCard companion={state.companion} />}

      <Button
        variant="ghost"
        size="sm"
        className="mt-auto justify-start text-xs text-muted-foreground hover:text-destructive"
        onClick={() => (confirmAbandon ? reset() : setConfirmAbandon(true))}
        onBlur={() => setConfirmAbandon(false)}
      >
        <LogOut className="mr-2 h-3 w-3" />
        {confirmAbandon ? "Click again to erase this run" : "Abandon run"}
      </Button>
    </aside>
  );
}
