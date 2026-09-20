import { useEffect, useState } from "react";
import { BookOpen, Coins, Crown, Package, Scroll, Sparkles } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EnemyCard } from "@/components/game/EnemyCard";
import { AbilityList } from "@/components/game/AbilityList";
import { InventoryPanel } from "@/components/game/InventoryPanel";
import { TradePanel } from "@/components/game/TradePanel";
import { useGameStore } from "@/hooks/useGameStore";
import type { Item, Quest } from "@/types/game";
import { cn } from "@/lib/utils";

function QuestCard({ q }: { q: Quest }) {
  const done = q.status === "completed";
  return (
    <div className={cn("rounded-lg border bg-black/20 p-3", q.main ? "border-[var(--gold)]/30" : "border-glass-border", done && "opacity-60")}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 font-display text-sm">
          {q.main && <Crown className="h-3.5 w-3.5 shrink-0 text-[var(--gold)]" aria-label="Main story" />}
          {q.title}
        </h3>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[9px] uppercase tracking-wider",
            done ? "bg-[var(--gold)]/15 text-[var(--gold)]" : "bg-cyan/15 text-cyan"
          )}
        >
          {done ? "Done" : "Active"}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{q.description}</p>
    </div>
  );
}

export function DataPad({ busy, onUseItem }: { busy: boolean; onUseItem: (item: Item) => void }) {
  const { state } = useGameStore();
  const trading = state.merchant !== null;
  const [tab, setTab] = useState("inventory");
  // A merchant showing up is worth a look: open their wares once.
  useEffect(() => {
    if (trading) setTab("trade");
  }, [trading, state.merchant?.name]);

  const quests = [...state.quests].sort(
    (a, b) => Number(a.status === "completed") - Number(b.status === "completed") || Number(!!b.main) - Number(!!a.main)
  );

  return (
    <aside className="glass-strong order-3 flex flex-col gap-4 rounded-2xl p-4 lg:h-full lg:overflow-y-auto [&::-webkit-scrollbar]:hidden">
      {state.gameState === "COMBAT" && state.currentEnemy && <EnemyCard enemy={state.currentEnemy} />}

      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <TabsList className={cn("grid w-full shrink-0 bg-black/30", trading ? "grid-cols-5" : "grid-cols-4")}>
          <TabsTrigger value="inventory" aria-label="Pack" className="px-1 text-xs data-[state=active]:bg-[color-mix(in_oklch,var(--gold)_15%,transparent)] data-[state=active]:text-[var(--gold)]">
            <Package className={cn("h-3.5 w-3.5", !trading && "mr-1")} /> {!trading && "Pack"}
          </TabsTrigger>
          <TabsTrigger value="skills" aria-label="Skills" className="px-1 text-xs data-[state=active]:bg-[color-mix(in_oklch,var(--gold)_15%,transparent)] data-[state=active]:text-[var(--gold)]">
            <Sparkles className={cn("h-3.5 w-3.5", !trading && "mr-1")} /> {!trading && "Skills"}
          </TabsTrigger>
          <TabsTrigger value="quests" aria-label="Quests" className="px-1 text-xs data-[state=active]:bg-[color-mix(in_oklch,var(--cyan)_15%,transparent)] data-[state=active]:text-cyan">
            <Scroll className={cn("h-3.5 w-3.5", !trading && "mr-1")} /> {!trading && "Quests"}
          </TabsTrigger>
          <TabsTrigger value="chronicle" aria-label="Lore" className="px-1 text-xs data-[state=active]:bg-[color-mix(in_oklch,var(--magenta)_15%,transparent)] data-[state=active]:text-[var(--magenta)]">
            <BookOpen className={cn("h-3.5 w-3.5", !trading && "mr-1")} /> {!trading && "Lore"}
          </TabsTrigger>
          {trading && (
            <TabsTrigger value="trade" aria-label="Trade" className="px-1 text-xs data-[state=active]:bg-[color-mix(in_oklch,var(--gold)_15%,transparent)] data-[state=active]:text-[var(--gold)]">
              <Coins className="h-3.5 w-3.5" />
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="inventory" className="mt-3 flex min-h-0 flex-1 flex-col">
          <InventoryPanel busy={busy} onUse={onUseItem} />
        </TabsContent>

        {trading && (
          <TabsContent value="trade" className="mt-3 flex min-h-0 flex-1 flex-col">
            <TradePanel />
          </TabsContent>
        )}

        <TabsContent value="skills" className="mt-3 flex-1 overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden">
          {state.player && <AbilityList player={state.player} />}
        </TabsContent>

        <TabsContent value="quests" className="mt-3 flex-1 space-y-2 overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden">
          {quests.map((q) => (
            <QuestCard key={q.id} q={q} />
          ))}
        </TabsContent>

        <TabsContent value="chronicle" className="mt-3 flex-1 overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden">
          {state.chronicle ? (
            <div className="whitespace-pre-line rounded-lg border border-glass-border bg-black/20 p-3 text-xs leading-relaxed text-foreground/90">
              {state.chronicle}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-border/40 p-4 text-center text-xs italic text-muted-foreground">
              The chronicle writes itself as your story unfolds. The Aether-Core reads it every turn, so people, places and promises
              are not forgotten.
            </p>
          )}
        </TabsContent>
      </Tabs>
    </aside>
  );
}
