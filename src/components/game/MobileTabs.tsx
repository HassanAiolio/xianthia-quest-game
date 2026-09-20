import { Backpack, ScrollText, User } from "lucide-react";
import { cn } from "@/lib/utils";

export type MobileTab = "story" | "hero" | "pack";

/**
 * Phones get one column at a time instead of three squeezed onto a strip.
 * The bar sits at the bottom, where a thumb already is.
 */
export function MobileTabs({
  tab,
  onTab,
  alerts,
}: {
  tab: MobileTab;
  onTab: (tab: MobileTab) => void;
  alerts: Partial<Record<MobileTab, boolean>>;
}) {
  // Fights are not here: the battle map takes the whole screen.
  const tabs = [
    { id: "story", label: "Story", icon: ScrollText },
    { id: "hero", label: "Hero", icon: User },
    { id: "pack", label: "Pack", icon: Backpack },
  ] as const;

  return (
    <nav aria-label="Sections" className="glass-strong mt-3 grid shrink-0 grid-cols-3 gap-1 rounded-2xl p-1 lg:hidden">
      {tabs.map(({ id, label, icon: Icon }) => {
        const active = tab === id;
        return (
          <button
            key={id}
            onClick={() => onTab(id)}
            aria-pressed={active}
            className={cn(
              "relative flex h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] uppercase tracking-[0.15em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/60",
              active
                ? "bg-[color-mix(in_oklch,var(--cyan)_16%,transparent)] text-cyan"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
            {alerts[id] && !active && (
              <span aria-hidden className="absolute right-4 top-2 h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--gold)]" />
            )}
          </button>
        );
      })}
    </nav>
  );
}
