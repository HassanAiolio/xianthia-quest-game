import { BookOpen, Crown, Package, Scroll } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EnemyCard } from "@/components/game/EnemyCard";
import { InventoryPanel } from "@/components/game/InventoryPanel";
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
  const quests = [...state.quests].sort(
    (a, b) => Number(a.status === "completed") - Number(b.status === "completed") || Number(!!b.main) - Number(!!a.main)
  );

  return (
    <aside className="glass-strong order-3 flex flex-col gap-4 rounded-2xl p-4 lg:h-full lg:overflow-y-auto [&::-webkit-scrollbar]:hidden">
      {state.gameState === "COMBAT" && state.currentEnemy && <EnemyCard enemy={state.currentEnemy} />}

      <Tabs defaultValue="inventory" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="grid w-full shrink-0 grid-cols-3 bg-black/30">
          <TabsTrigger value="inventory" className="px-1 text-xs data-[state=active]:bg-[color-mix(in_oklch,var(--gold)_15%,transparent)] data-[state=active]:text-[var(--gold)]">
            <Package className="mr-1 h-3.5 w-3.5" /> Pack
          </TabsTrigger>
          <TabsTrigger value="quests" className="px-1 text-xs data-[state=active]:bg-[color-mix(in_oklch,var(--cyan)_15%,transparent)] data-[state=active]:text-cyan">
            <Scroll className="mr-1 h-3.5 w-3.5" /> Quests
          </TabsTrigger>
          <TabsTrigger value="chronicle" className="px-1 text-xs data-[state=active]:bg-[color-mix(in_oklch,var(--magenta)_15%,transparent)] data-[state=active]:text-[var(--magenta)]">
            <BookOpen className="mr-1 h-3.5 w-3.5" /> Chronicle
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inventory" className="mt-3 flex min-h-0 flex-1 flex-col">
          <InventoryPanel busy={busy} onUse={onUseItem} />
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
