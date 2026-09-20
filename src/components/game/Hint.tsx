import { motion } from "framer-motion";
import { Lightbulb, X } from "lucide-react";
import { useHint } from "@/hooks/useHint";

/** A one-time tip for a first-time player; once dismissed it never returns. */
export function Hint({ id, children }: { id: string; children: React.ReactNode }) {
  const { show, dismiss } = useHint(id);
  if (!show) return null;
  return (
    <motion.aside
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-2 flex items-start gap-2 rounded-lg border border-cyan/30 bg-[color-mix(in_oklch,var(--cyan)_8%,transparent)] px-3 py-2 text-xs text-foreground/90"
    >
      <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan" aria-hidden />
      <p className="flex-1 leading-snug">{children}</p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss tip"
        className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </motion.aside>
  );
}
