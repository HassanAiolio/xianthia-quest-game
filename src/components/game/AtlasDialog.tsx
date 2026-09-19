import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { MapPin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GameImage } from "@/components/game/GameImage";
import { useGameStore } from "@/hooks/useGameStore";
import { sceneUrl } from "@/services/imageService";
import { CHAPTERS } from "@/game/story";
import { cn } from "@/lib/utils";

/** Every place the player has been, in the order they found them. */
export function AtlasDialog({ onClose, onTravel }: { onClose: () => void; onTravel: (name: string) => void }) {
  const { state } = useGameStore();
  const closeButton = useRef<HTMLButtonElement>(null);
  const busy = state.gameState === "COMBAT" || state.gameState === "GAMEOVER";

  useEffect(() => {
    closeButton.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="atlas-title"
        initial={{ scale: 0.95, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        className="glass-strong flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl p-5"
      >
        <div className="flex items-center justify-between">
          <h2 id="atlas-title" className="text-gradient-gold font-display text-2xl">
            Atlas
          </h2>
          <button ref={closeButton} onClick={onClose} aria-label="Close atlas" className="rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {state.visited.length} place{state.visited.length === 1 ? "" : "s"} found across Xianthia.
        </p>

        <ul className="mt-4 space-y-2 overflow-y-auto pr-1">
          {state.visited.map((place) => {
            const current = place.name === state.currentLocation.name;
            return (
              <li
                key={place.name}
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-2",
                  current ? "border-cyan/50 bg-[color-mix(in_oklch,var(--cyan)_8%,transparent)]" : "border-glass-border bg-black/20"
                )}
              >
                <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg border border-glass-border bg-black/40">
                  <GameImage src={sceneUrl(place)} alt="" fallback={<MapPin className="h-5 w-5 text-cyan/50" />} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-display text-sm">{place.name}</h3>
                    <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
                      {place.chapter <= CHAPTERS.length ? `Ch. ${place.chapter}` : "Epilogue"}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-[11px] text-muted-foreground">{place.description}</p>
                </div>
                {current ? (
                  <span className="shrink-0 text-[10px] uppercase tracking-wider text-cyan">You are here</span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    title={busy ? "Not while something is trying to kill you" : undefined}
                    onClick={() => {
                      onTravel(place.name);
                      onClose();
                    }}
                    className="h-7 shrink-0 border-glass-border text-xs"
                  >
                    Travel
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </motion.div>
    </motion.div>
  );
}
