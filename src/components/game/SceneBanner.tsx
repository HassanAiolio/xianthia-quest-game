import { useMemo } from "react";
import { Map } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GameImage } from "@/components/game/GameImage";
import { useGameStore } from "@/hooks/useGameStore";
import { sceneUrl } from "@/services/imageService";
import { CHAPTERS, getChapter } from "@/game/story";
import { cn } from "@/lib/utils";

export function SceneBanner({ onOpenAtlas, className }: { onOpenAtlas: () => void; className?: string }) {
  const { state } = useGameStore();
  const location = state.currentLocation;
  const src = useMemo(() => sceneUrl(location), [location]);
  const chapter = getChapter(state.chapter);

  return (
    <div className={cn("glass-strong relative shrink-0 overflow-hidden rounded-2xl", className)}>
      <div className="relative aspect-[21/9] bg-gradient-to-br from-[oklch(0.18_0.05_280)] via-[oklch(0.14_0.04_260)] to-[oklch(0.12_0.06_320)] lg:aspect-[3/1]">
        <GameImage src={src} alt={location.name} fallback={null} className="opacity-85" />
        <div className="scanlines absolute inset-0 opacity-25" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="absolute left-4 top-3 rounded-full border border-glass-border bg-black/40 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground backdrop-blur">
          {chapter ? `Chapter ${chapter.id}/${CHAPTERS.length} · ${chapter.title}` : "Epilogue · Free roam"}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={onOpenAtlas}
          className="absolute right-3 top-2.5 h-7 gap-1.5 border-glass-border bg-black/50 px-2.5 text-xs backdrop-blur hover:border-cyan/50 hover:text-cyan"
        >
          <Map className="h-3.5 w-3.5" /> Atlas
          <span className="text-[10px] text-muted-foreground">{state.visited.length}</span>
        </Button>
        <div className="absolute inset-x-0 bottom-0 p-4">
          <div className="text-[10px] uppercase tracking-[0.3em] text-cyan">Current location</div>
          <h1 className="font-display text-xl">{location.name}</h1>
          <p className="mt-1 line-clamp-2 max-w-2xl text-xs text-muted-foreground">{location.description}</p>
        </div>
      </div>
    </div>
  );
}
