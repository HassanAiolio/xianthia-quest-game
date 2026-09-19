import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useApiStatus } from "@/hooks/useApiStatus";

interface GameImageProps {
  src?: string | null;
  alt: string;
  /** Shown underneath until the picture loads, and instead of it when images are off or fail. */
  fallback: ReactNode;
  className?: string;
}

/** Server-generated art: fades in over its fallback, never shows a broken image. */
export function GameImage({ src, alt, fallback, className }: GameImageProps) {
  const status = useApiStatus();
  const [phase, setPhase] = useState<"loading" | "loaded" | "error">("loading");
  useEffect(() => setPhase("loading"), [src]);

  const enabled = Boolean(src) && status?.images !== false;
  return (
    <>
      <div className="absolute inset-0 flex items-center justify-center">{fallback}</div>
      {enabled && phase !== "error" && (
        <img
          key={src}
          src={src!}
          alt={alt}
          onLoad={() => setPhase("loaded")}
          onError={() => setPhase("error")}
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-700",
            phase === "loaded" ? "opacity-100" : "opacity-0",
            className
          )}
        />
      )}
      {enabled && phase === "loading" && (
        <div
          aria-hidden
          className="absolute inset-0 animate-[shimmer_2.5s_linear_infinite] bg-[linear-gradient(90deg,transparent,color-mix(in_oklch,var(--cyan)_10%,transparent),transparent)] bg-[length:200%_100%]"
        />
      )}
    </>
  );
}
