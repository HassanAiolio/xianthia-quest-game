import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface VitalBarProps {
  label: string;
  value: number;
  max: number;
  variant: "hp" | "mp" | "xp";
}

const VARIANT_GRADIENT: Record<VitalBarProps["variant"], string> = {
  hp: "var(--gradient-hp)",
  mp: "var(--gradient-mp)",
  xp: "var(--gradient-xp)",
};

export function VitalBar({ label, value, max, variant }: VitalBarProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[10px] font-medium uppercase tracking-wider">
        <span className={cn(
          variant === "hp" && "text-[var(--hp)]",
          variant === "mp" && "text-[var(--mp)]",
          variant === "xp" && "text-[var(--gold)]"
        )}>{label}</span>
        <span className="font-display text-foreground">
          {Math.round(value)} <span className="text-muted-foreground">/ {max}</span>
        </span>
      </div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-black/40 border border-glass-border">
        <motion.div
          className="h-full rounded-full"
          style={{ background: VARIANT_GRADIENT[variant] }}
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 18 }}
        />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.15),transparent)] bg-[length:200%_100%] animate-[shimmer_3s_linear_infinite]" />
      </div>
    </div>
  );
}
