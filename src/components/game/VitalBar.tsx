import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface VitalBarProps {
  label: string;
  value: number;
  max: number;
  variant: "hp" | "mp" | "xp";
  /** Float "-8" / "+12" above the bar when the value changes. */
  showChanges?: boolean;
  /** Seconds to wait before reacting, so damage lands with the dice rather than before it. */
  delay?: number;
}

const VARIANT_GRADIENT: Record<VitalBarProps["variant"], string> = {
  hp: "var(--gradient-hp)",
  mp: "var(--gradient-mp)",
  xp: "var(--gradient-xp)",
};

let popId = 0;

export function VitalBar({ label, value, max, variant, showChanges = false, delay = 0 }: VitalBarProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const previous = useRef(value);
  const [pops, setPops] = useState<{ id: number; delta: number }[]>([]);

  useEffect(() => {
    const delta = Math.round(value - previous.current);
    previous.current = value;
    if (!showChanges || delta === 0) return;
    const id = ++popId;
    setPops((p) => [...p.slice(-2), { id, delta }]);
    setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 1600 + delay * 1000);
  }, [value, showChanges, delay]);

  return (
    <div className="relative">
      <div className="mb-1 flex items-center justify-between text-[10px] font-medium uppercase tracking-wider">
        <span
          className={cn(
            variant === "hp" && "text-[var(--hp)]",
            variant === "mp" && "text-[var(--mp)]",
            variant === "xp" && "text-[var(--gold)]"
          )}
        >
          {label}
        </span>
        <span className="font-display text-foreground">
          {Math.round(value)} <span className="text-muted-foreground">/ {max}</span>
        </span>
      </div>
      <div className="relative h-2.5 overflow-hidden rounded-full border border-glass-border bg-black/40">
        <motion.div
          className="h-full rounded-full"
          style={{ background: VARIANT_GRADIENT[variant] }}
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 18, delay }}
        />
        <div className="pointer-events-none absolute inset-0 animate-[shimmer_3s_linear_infinite] bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.15),transparent)] bg-[length:200%_100%]" />
      </div>
      <AnimatePresence>
        {pops.map((p) => (
          <motion.span
            key={p.id}
            aria-hidden
            initial={{ opacity: 0, y: 0, scale: 0.8 }}
            animate={{ opacity: [0, 1, 1, 0], y: -26, scale: 1 }}
            transition={{ duration: 1.4, delay, times: [0, 0.15, 0.7, 1] }}
            className={cn(
              "pointer-events-none absolute right-1 top-0 font-display text-sm font-bold drop-shadow-[0_1px_2px_black]",
              p.delta < 0 ? "text-destructive" : "text-emerald-300"
            )}
          >
            {p.delta > 0 ? `+${p.delta}` : p.delta}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}
