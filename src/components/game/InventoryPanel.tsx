import { useState } from "react";
import { FlaskConical, Gem, KeyRound, Shield, Sword, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGameStore } from "@/hooks/useGameStore";
import type { Item, ItemType } from "@/types/game";
import { INVENTORY_CAP, isEquippable } from "@/game/stats";
import { cn } from "@/lib/utils";

const TYPE_ICONS: Record<ItemType, LucideIcon> = {
  weapon: Sword,
  armor: Shield,
  consumable: FlaskConical,
  artifact: Gem,
  key: KeyRound,
};

function ItemDetails({ item, busy, onUse }: { item: Item; busy: boolean; onUse: (item: Item) => void }) {
  const { state, toggleEquip } = useGameStore();
  const inCombat = state.gameState === "COMBAT";
  const perks = [
    ...Object.entries(item.statBonus ?? {}).map(([stat, v]) => `+${v} ${stat.toUpperCase()}`),
    item.armorBonus ? `+${item.armorBonus} AC` : "",
    item.effect?.hp ? `+${item.effect.hp} HP` : "",
    item.effect?.mp ? `+${item.effect.mp} MP` : "",
  ].filter(Boolean);

  return (
    <div className="animate-fade-up">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-sm leading-tight text-[var(--gold)]">{item.name}</h3>
        <span className="shrink-0 rounded border border-border/50 bg-black/20 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
          {item.equipped ? "Equipped" : item.type}
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-foreground">{item.description}</p>
      {perks.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {perks.map((p) => (
            <span key={p} className="rounded border border-cyan/20 bg-cyan/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-cyan">
              {p}
            </span>
          ))}
        </div>
      )}
      <div className="mt-3 flex gap-2">
        {isEquippable(item) && (
          <Button
            size="sm"
            variant="outline"
            disabled={inCombat}
            title={inCombat ? "You can't change gear mid-fight" : undefined}
            onClick={() => toggleEquip(item.id)}
            className="h-7 border-glass-border text-xs"
          >
            {item.equipped ? "Unequip" : "Equip"}
          </Button>
        )}
        {item.type === "consumable" && (
          <Button size="sm" disabled={busy || state.gameState === "GAMEOVER"} onClick={() => onUse(item)} className="h-7 bg-[var(--gold)] text-xs text-[var(--gold-foreground)] hover:bg-[var(--gold)]/90">
            Use{inCombat ? " (takes your turn)" : ""}
          </Button>
        )}
      </div>
    </div>
  );
}

export function InventoryPanel({ busy, onUse }: { busy: boolean; onUse: (item: Item) => void }) {
  const { state } = useGameStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const inventory = state.inventory;
  const selected = inventory.find((i) => i.id === selectedId);

  return (
    <>
      <div className="mb-2 flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>Pack</span>
        <span>
          {inventory.length} / {INVENTORY_CAP}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 overflow-y-auto pb-2 pr-1 [&::-webkit-scrollbar]:hidden">
        {inventory.map((item) => {
          const Icon = TYPE_ICONS[item.type] ?? Gem;
          const isSelected = item.id === selectedId;
          return (
            <button
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              aria-pressed={isSelected}
              aria-label={`${item.name}${item.equipped ? " (equipped)" : ""}`}
              className={cn(
                "group relative aspect-square rounded-lg border bg-black/30 p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]",
                isSelected
                  ? "border-[var(--gold)] bg-[color-mix(in_oklch,var(--gold)_15%,transparent)] shadow-[0_0_12px_color-mix(in_oklch,var(--gold)_20%,transparent)]"
                  : "border-glass-border hover:border-[var(--gold)]/60 hover:bg-[color-mix(in_oklch,var(--gold)_8%,transparent)]"
              )}
            >
              {item.equipped && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-cyan shadow-[0_0_6px_var(--cyan)]" aria-hidden />}
              <div className="flex h-full flex-col items-center justify-center text-center">
                <Icon className={cn("h-5 w-5 transition-colors", isSelected ? "text-[var(--gold)]" : "text-cyan/70 group-hover:text-[var(--gold)]")} />
                <div className={cn("mt-1 line-clamp-2 text-[10px] leading-tight", isSelected ? "text-foreground" : "text-muted-foreground group-hover:text-foreground")}>
                  {item.name}
                </div>
              </div>
            </button>
          );
        })}
        {Array.from({ length: Math.max(0, 9 - inventory.length) }).map((_, i) => (
          <div key={i} className="aspect-square rounded-lg border border-dashed border-border/40 bg-black/10" aria-hidden />
        ))}
      </div>
      <div className="mt-2 min-h-[132px] shrink-0 rounded-lg border border-glass-border bg-black/40 p-3">
        {selected ? (
          <ItemDetails item={selected} busy={busy} onUse={onUse} />
        ) : (
          <div className="flex h-full min-h-[100px] items-center justify-center text-center text-xs italic text-muted-foreground">
            Select an item to inspect, equip or use it.
          </div>
        )}
      </div>
    </>
  );
}
