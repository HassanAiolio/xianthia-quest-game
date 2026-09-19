import { Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGameStore } from "@/hooks/useGameStore";
import { canSell, sellPrice } from "@/game/economy";
import { INVENTORY_CAP } from "@/game/stats";
import type { Item } from "@/types/game";
import { cn } from "@/lib/utils";

function perks(item: Item): string {
  return [
    ...Object.entries(item.statBonus ?? {}).map(([stat, v]) => `+${v} ${stat.toUpperCase()}`),
    item.armorBonus ? `+${item.armorBonus} AC` : "",
    item.effect?.hp ? `+${item.effect.hp} HP` : "",
    item.effect?.mp ? `+${item.effect.mp} MP` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function TradePanel() {
  const { state, buy, sell } = useGameStore();
  const merchant = state.merchant!;
  const full = state.inventory.length >= INVENTORY_CAP;
  const sellable = state.inventory.filter(canSell);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden">
      <div className="rounded-lg border border-[var(--gold)]/30 bg-black/20 p-3">
        <h3 className="font-display text-sm text-[var(--gold)]">{merchant.name}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{merchant.description}</p>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
          <span>For sale</span>
          {full && <span className="text-destructive">Pack full</span>}
        </div>
        <ul className="space-y-1.5">
          {merchant.stock.map((offer, index) => {
            const affordable = state.shards >= offer.price;
            return (
              <li key={offer.item.id} className="flex items-center gap-2 rounded-lg border border-glass-border bg-black/20 p-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs text-foreground">{offer.item.name}</div>
                  <div className="truncate text-[10px] text-muted-foreground">{perks(offer.item) || offer.item.type}</div>
                </div>
                <Button
                  size="sm"
                  disabled={!affordable || full}
                  title={!affordable ? "Not enough shards" : full ? "Your pack is full" : undefined}
                  onClick={() => buy(index)}
                  className={cn("h-7 shrink-0 gap-1 px-2 text-xs", affordable && !full ? "bg-[var(--gold)] text-[var(--gold-foreground)] hover:bg-[var(--gold)]/90" : "")}
                >
                  <Coins className="h-3 w-3" /> {offer.price}
                </Button>
              </li>
            );
          })}
          {merchant.stock.length === 0 && <li className="p-2 text-center text-xs italic text-muted-foreground">Sold out.</li>}
        </ul>
      </div>

      <div>
        <div className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">Your wares (40% of value)</div>
        <ul className="space-y-1.5">
          {sellable.map((item) => (
            <li key={item.id} className="flex items-center gap-2 rounded-lg border border-glass-border bg-black/20 p-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs text-foreground">{item.name}</div>
                <div className="truncate text-[10px] text-muted-foreground">{perks(item) || item.type}</div>
              </div>
              <Button size="sm" variant="outline" onClick={() => sell(item.id)} className="h-7 shrink-0 gap-1 border-glass-border px-2 text-xs">
                <Coins className="h-3 w-3" /> {sellPrice(item)}
              </Button>
            </li>
          ))}
          {sellable.length === 0 && (
            <li className="p-2 text-center text-xs italic text-muted-foreground">Nothing to sell. Equipped gear and key items stay with you.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
