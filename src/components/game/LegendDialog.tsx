import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Check, Copy, ScrollText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGameStore } from "@/hooks/useGameStore";
import { buildLegend, legendText } from "@/game/legend";

/** The run, told in one page: what they did, what it cost, how it ended. */
export function LegendDialog({ onClose }: { onClose: () => void }) {
  const { state } = useGameStore();
  const closeButton = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState(false);
  const legend = buildLegend(state);

  useEffect(() => {
    closeButton.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(legendText(state));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the text is on the page to select by hand */
    }
  }

  // The panels it opens from are blurred glass, which would trap a fixed overlay inside them.
  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md"
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="legend-title"
        initial={{ scale: 0.95, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        className="glass-strong flex max-h-[88vh] w-full max-w-lg flex-col overflow-y-auto rounded-2xl p-5 [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="legend-title" className="text-gradient-gold font-display text-2xl leading-tight">
              {legend.title}
            </h2>
            <p className="mt-1 text-xs uppercase tracking-[0.2em] text-cyan">{legend.subtitle}</p>
          </div>
          <Button ref={closeButton} variant="ghost" size="sm" onClick={onClose} aria-label="Close the legend" className="h-8 w-8 shrink-0 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {legend.lines.map((line) => (
            <div key={line.label} className="rounded-lg border border-glass-border bg-black/25 p-2.5">
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{line.label}</dt>
              <dd className="font-display text-base text-foreground">{line.value}</dd>
            </div>
          ))}
        </dl>

        {legend.choices.length > 0 && (
          <div className="mt-4 rounded-lg border border-[var(--gold)]/30 bg-[color-mix(in_oklch,var(--gold)_6%,transparent)] p-3">
            <h3 className="text-[10px] uppercase tracking-wider text-[var(--gold)]">What they did</h3>
            <ul className="mt-1.5 space-y-1 text-sm text-foreground/90">
              {legend.choices.map((choice) => (
                <li key={choice}>· {choice}</li>
              ))}
            </ul>
          </div>
        )}

        {legend.closing && (
          <p className="mt-4 whitespace-pre-line border-l-2 border-cyan/40 pl-3 text-sm italic leading-relaxed text-foreground/85">
            {legend.closing}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <Button onClick={copy} className="flex-1 gap-2 bg-gradient-to-r from-[var(--gold)] to-[var(--cyan)] text-[var(--gold-foreground)]">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy the legend"}
          </Button>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}

/** The button that opens it, used from the chronicle and the end screens. */
export function LegendButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className={className}>
        <ScrollText className="mr-2 h-3.5 w-3.5" /> Your legend
      </Button>
      {open && <LegendDialog onClose={() => setOpen(false)} />}
    </>
  );
}
