import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FlaskConical, Footprints, Heart, ScrollText, Shield, Skull, Sparkles, Sword, User, Wind, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Hint } from "@/components/game/Hint";
import { NarrativeLog } from "@/components/game/NarrativeLog";
import { SoundControls } from "@/components/game/SoundControls";
import { useGameStore } from "@/hooks/useGameStore";
import { unlockedAbilities } from "@/game/abilities";
import { BOARD, MELEE_REACH, coverBonus, dist, key, playerSpeed, reachable } from "@/game/battlefield";
import { TIERS } from "@/game/enemies";
import type { CombatAction } from "@/game/combat";
import type { TurnInput } from "@/game/engine";
import type { Square } from "@/types/game";
import { cn } from "@/lib/utils";

/** The board fills whatever space is left, in whole squares. */
function useCellSize(ref: RefObject<HTMLDivElement | null>) {
  const [cell, setCell] = useState(40);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width && height) setCell(Math.max(26, Math.floor(Math.min(width / BOARD.w, height / BOARD.h))));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, [ref]);
  return cell;
}

function Token({
  at,
  cell,
  icon,
  name,
  hp,
  maxHp,
  tone,
  ghost,
}: {
  at: Square;
  cell: number;
  icon: ReactNode;
  name: string;
  hp: number;
  maxHp: number;
  tone: "player" | "ally" | "enemy";
  ghost?: boolean;
}) {
  const colors = {
    player: "border-cyan bg-[color-mix(in_oklch,var(--cyan)_25%,black)] text-cyan shadow-[0_0_14px_color-mix(in_oklch,var(--cyan)_45%,transparent)]",
    ally: "border-emerald-300 bg-[color-mix(in_oklch,oklch(0.85_0.15_160)_22%,black)] text-emerald-200",
    enemy: "border-destructive bg-[color-mix(in_oklch,var(--destructive)_25%,black)] text-destructive shadow-[0_0_14px_color-mix(in_oklch,var(--destructive)_45%,transparent)]",
  }[tone];
  const bar = { player: "bg-cyan", ally: "bg-emerald-300", enemy: "bg-destructive" }[tone];

  return (
    <motion.div
      initial={false}
      animate={{ x: at.x * cell, y: at.y * cell }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      className={cn("pointer-events-none absolute left-0 top-0 z-10 flex items-center justify-center", ghost && "opacity-40")}
      style={{ width: cell, height: cell }}
      aria-hidden={ghost}
    >
      <div
        role="img"
        aria-label={`${name}, ${hp} of ${maxHp} HP, column ${at.x + 1}, row ${at.y + 1}`}
        style={{ width: Math.round(cell * 0.82), height: Math.round(cell * 0.82) }}
        className={cn("relative flex items-center justify-center rounded-full border-2", colors, ghost && "border-dashed")}
      >
        {icon}
        {!ghost && (
          <span className="absolute -bottom-1 left-1/2 h-1 w-[80%] -translate-x-1/2 overflow-hidden rounded-full bg-black/70">
            <span className={cn("block h-full rounded-full transition-[width]", bar)} style={{ width: `${Math.max(0, (hp / maxHp) * 100)}%` }} />
          </span>
        )}
      </div>
    </motion.div>
  );
}

interface BattleBoardProps {
  busy: boolean;
  onPlay: (input: TurnInput, echo: string) => Promise<boolean>;
  /** The dice animation, owned by GameView so sound and shake stay in one place. */
  dice: ReactNode;
}

/**
 * Combat, played on the table: move your token, then spend your action.
 * The rules it shows — six squares, reach, cover, free swings — are the ones
 * game/battlefield.ts enforces on the way through.
 */
export function BattleBoard({ busy, onPlay, dice }: BattleBoardProps) {
  const { state } = useGameStore();
  const boardArea = useRef<HTMLDivElement>(null);
  const cell = useCellSize(boardArea);
  const [plan, setPlan] = useState<Square | null>(null);
  const [abilitiesOpen, setAbilitiesOpen] = useState(false);
  const [itemsOpen, setItemsOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [text, setText] = useState("");

  const player = state.player!;
  const enemy = state.currentEnemy!;
  const field = state.battlefield!;
  const speed = playerSpeed();
  const options = useMemo(() => reachable(field, field.player, speed), [field, speed]);
  const coverSet = useMemo(() => new Set(field.cover), [field.cover]);
  const from = plan ?? field.player;
  const gap = dist(from, field.enemy) - MELEE_REACH;
  // A shooter threatens the whole room, so the useful thing to show is where you are shielded.
  const reach = enemy.ranged ?? MELEE_REACH;
  const exposed = dist(from, field.enemy) <= reach;
  const abilities = unlockedAbilities(player);
  const consumables = state.inventory.filter((i) => i.type === "consumable");
  const disabled = busy || state.gameState !== "COMBAT";
  const lastLine = [...state.gameLog].reverse().find((m) => m.sender === "AI" && m.tone !== "error")?.text ?? "";

  // A new round starts where the token actually is.
  useEffect(() => setPlan(null), [field.player.x, field.player.y]);

  function act(action: CombatAction, label: string) {
    const flavour = text.trim();
    setText("");
    setAbilitiesOpen(false);
    setItemsOpen(false);
    const moveTo = plan ?? undefined;
    const echo = [flavour || label, moveTo && !flavour ? `(moved ${options.get(key(moveTo))} squares)` : ""].filter(Boolean).join(" ");
    void onPlay({ kind: "combat", action, text: flavour || undefined, moveTo }, echo).then((ok) => !ok && flavour && setText((t) => t || flavour));
  }

  const chip =
    "h-auto min-h-10 whitespace-normal border-glass-border bg-[var(--glass)] py-1.5 text-xs leading-snug hover:border-cyan/50 hover:bg-[color-mix(in_oklch,var(--cyan)_10%,transparent)] hover:text-cyan";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-30 flex flex-col bg-[oklch(0.09_0.03_275)] px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 sm:px-5 sm:py-4"
      style={{ backgroundImage: "var(--gradient-aurora)" }}
    >
      {/* ── Who you are fighting, and how you are holding up ───────────────── */}
      <header className="glass-strong mx-auto flex w-full max-w-5xl shrink-0 items-center gap-3 rounded-xl px-3 py-2">
        <Skull className="h-5 w-5 shrink-0 text-destructive" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h2 className="truncate font-display text-sm text-destructive sm:text-base">{enemy.name}</h2>
            <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
              {TIERS[enemy.tier].label} · AC {enemy.ac}
              {enemy.ranged ? ` · shoots ${enemy.ranged} sq` : ""}
              {enemy.phase === 2 && " · Phase 2"}
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/60">
            <div className="h-full rounded-full bg-gradient-to-r from-destructive to-[oklch(0.7_0.2_20)]" style={{ width: `${(enemy.hp / enemy.maxHp) * 100}%` }} />
          </div>
        </div>
        <div className="hidden shrink-0 gap-3 text-right text-[11px] sm:flex">
          <span className="text-destructive">
            <Heart className="mr-1 inline h-3 w-3" />
            {player.hp}/{player.maxHp}
          </span>
          <span className="text-cyan">
            <Sparkles className="mr-1 inline h-3 w-3" />
            {player.mp}/{player.maxMp}
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setLogOpen(true)} className="h-8 shrink-0 gap-1.5 px-2 text-xs text-muted-foreground hover:text-cyan">
          <ScrollText className="h-4 w-4" /> <span className="hidden sm:inline">Story</span>
        </Button>
        <SoundControls />
      </header>

      {/* ── The table ──────────────────────────────────────────────────────── */}
      <div ref={boardArea} className="relative my-2 flex min-h-0 flex-1 items-center justify-center">
        <div
          role="group"
          aria-label="Battle map"
          className="relative rounded-lg border border-cyan/25 bg-[oklch(0.13_0.04_270)] shadow-[0_0_40px_color-mix(in_oklch,var(--cyan)_12%,transparent)]"
          style={{ width: cell * BOARD.w, height: cell * BOARD.h }}
        >
          {Array.from({ length: BOARD.h }, (_, y) =>
            Array.from({ length: BOARD.w }, (_, x) => {
              const here = { x, y };
              const k = key(here);
              const cost = options.get(k);
              const isCover = coverSet.has(k);
              const threatened = !enemy.ranged && !isCover && dist(here, field.enemy) <= MELEE_REACH;
              const shielded = Boolean(enemy.ranged) && !isCover && coverBonus(field, field.enemy, here) > 0;
              const planned = plan?.x === x && plan?.y === y;
              return (
                <button
                  key={k}
                  type="button"
                  disabled={cost === undefined || disabled}
                  onClick={() => setPlan(planned ? null : here)}
                  aria-label={
                    isCover
                      ? `Pillar, column ${x + 1}, row ${y + 1}`
                      : cost === undefined
                        ? `Column ${x + 1}, row ${y + 1}, out of reach`
                        : `Move to column ${x + 1}, row ${y + 1}, ${cost} square${cost === 1 ? "" : "s"}${threatened ? ", within enemy reach" : ""}${shielded ? ", behind cover" : ""}`
                  }
                  className={cn(
                    "absolute border border-cyan/10 transition-colors",
                    isCover && "border-cyan/25 bg-[oklch(0.26_0.06_250)]",
                    threatened && "bg-destructive/20",
                    shielded && "bg-emerald-400/25 ring-1 ring-inset ring-emerald-300/40",
                    cost !== undefined && !disabled && "cursor-pointer bg-cyan/[0.07] hover:bg-cyan/30 focus-visible:z-20 focus-visible:bg-cyan/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan",
                    planned && "bg-[var(--gold)]/30 ring-2 ring-[var(--gold)]"
                  )}
                  style={{ left: x * cell, top: y * cell, width: cell, height: cell }}
                >
                  {isCover && (
                    <span
                      aria-hidden
                      className="absolute rounded-sm border border-cyan/40 bg-gradient-to-br from-cyan/35 to-cyan/5"
                      style={{ inset: Math.round(cell * 0.12) }}
                    />
                  )}
                  {cost !== undefined && !planned && (
                    <span aria-hidden className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan/60" />
                  )}
                  {planned && (
                    <span className="absolute inset-x-0 bottom-0 text-center font-mono text-[10px] font-bold text-[var(--gold)]">{options.get(k)}</span>
                  )}
                </button>
              );
            })
          )}

          {plan && <Token at={plan} cell={cell} tone="player" icon={<User className="h-1/2 w-1/2" />} name="Your destination" hp={player.hp} maxHp={player.maxHp} ghost />}
          <Token at={field.player} cell={cell} tone="player" icon={<User className="h-1/2 w-1/2" />} name={player.name} hp={player.hp} maxHp={player.maxHp} />
          {state.companion && field.ally && !state.companion.down && (
            <Token at={field.ally} cell={cell} tone="ally" icon={<Shield className="h-1/2 w-1/2" />} name={state.companion.name} hp={state.companion.hp} maxHp={state.companion.maxHp} />
          )}
          <Token at={field.enemy} cell={cell} tone="enemy" icon={<Skull className="h-1/2 w-1/2" />} name={enemy.name} hp={enemy.hp} maxHp={enemy.maxHp} />
        </div>
        <div className="pointer-events-none absolute right-0 top-0">{dice}</div>
      </div>

      {/* ── Your turn ──────────────────────────────────────────────────────── */}
      <div className="glass-strong mx-auto w-full max-w-5xl shrink-0 space-y-2 rounded-xl p-2.5">
        <Hint id="first-board">
          Your turn is a move and an action. Tap a lit square to walk (up to {speed}), then choose what you do. Stepping out of a
          monster&apos;s reach gives it a free swing, and a pillar between you is +2 AC for whoever hides behind it.
        </Hint>

        {lastLine && (
          <button onClick={() => setLogOpen(true)} className="block w-full rounded-lg border border-cyan/20 bg-black/30 px-3 py-1.5 text-left text-xs italic leading-snug text-foreground/85 hover:border-cyan/40">
            <span className="line-clamp-2">{lastLine}</span>
          </button>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-muted-foreground">
          <span>
            {plan ? (
              <>
                Move planned: <span className="text-[var(--gold)]">{options.get(key(plan))} squares</span>
              </>
            ) : (
              <>Speed {speed} squares · tap the map to move</>
            )}
            {" · "}
            {gap <= 0 ? <span className="text-[var(--gold)]">{enemy.name} in reach</span> : `${gap} square${gap === 1 ? "" : "s"} short of reach`}
            {enemy.ranged && (
              <>
                {" · "}
                {exposed ? (
                  <span className="text-destructive">in its line of fire</span>
                ) : (
                  <span className="text-emerald-300">out of its range</span>
                )}
                <span className="text-emerald-300"> · green squares are shielded</span>
              </>
            )}
          </span>
          {plan && (
            <Button variant="ghost" size="sm" onClick={() => setPlan(null)} className="h-6 px-2 text-[11px]">
              Cancel move
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
          <Button variant="outline" size="sm" disabled={disabled} onClick={() => act({ kind: "attack" }, "Attack!")} className={cn(chip, "border-destructive/40 text-destructive hover:text-destructive")}>
            <Sword /> {gap > 0 ? "Charge" : "Attack"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || player.mp < Math.min(...abilities.map((a) => a.mp))}
            aria-expanded={abilitiesOpen}
            onClick={() => (abilities.length === 1 ? act({ kind: "ability", abilityId: abilities[0].id }, `${abilities[0].name}!`) : setAbilitiesOpen((o) => !o))}
            className={cn(chip, "border-[var(--gold)]/40 text-[var(--gold)]")}
          >
            <Sparkles /> {abilities.length === 1 ? abilities[0].name : "Abilities"}
          </Button>
          <Button variant="outline" size="sm" disabled={disabled} onClick={() => act({ kind: "defend" }, "Defend.")} className={chip}>
            <Shield /> Defend
          </Button>
          <Button variant="outline" size="sm" disabled={disabled || !plan} title={plan ? undefined : "Plan a move first"} onClick={() => act({ kind: "dash" }, "Dash!")} className={chip}>
            <Wind /> Dash
          </Button>
          <Button variant="outline" size="sm" disabled={disabled || consumables.length === 0} aria-expanded={itemsOpen} onClick={() => setItemsOpen((o) => !o)} className={chip}>
            <FlaskConical /> Item ({consumables.length})
          </Button>
          <Button variant="outline" size="sm" disabled={disabled} onClick={() => act({ kind: "flee" }, "Flee!")} className={chip}>
            <Footprints /> Flee
          </Button>
        </div>

        {abilitiesOpen && abilities.length > 1 && (
          <div className="flex flex-wrap gap-2 rounded-lg border border-[var(--gold)]/30 bg-black/30 p-2" role="group" aria-label="Abilities">
            {abilities.map((a) => (
              <Button
                key={a.id}
                variant="outline"
                size="sm"
                disabled={disabled || player.mp < a.mp}
                title={player.mp < a.mp ? `Needs ${a.mp} MP` : a.text}
                onClick={() => act({ kind: "ability", abilityId: a.id }, `${a.name}!`)}
                className={cn(chip, "border-[var(--gold)]/40 text-[var(--gold)]")}
              >
                <Sparkles /> {a.name}
                <span className="text-[10px] opacity-70">
                  {a.mp} MP · {a.range === 0 ? "self" : a.range === 1 ? "melee" : `${a.range} sq`}
                </span>
              </Button>
            ))}
          </div>
        )}

        {itemsOpen && consumables.length > 0 && (
          <div className="flex flex-wrap gap-2 rounded-lg border border-glass-border bg-black/30 p-2" role="group" aria-label="Consumables">
            {consumables.map((item) => (
              <Button key={item.id} variant="outline" size="sm" disabled={disabled} onClick={() => act({ kind: "item", itemId: item.id }, `Use ${item.name}.`)} className={chip}>
                <FlaskConical /> {item.name}
              </Button>
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim() && !disabled) act({ kind: "attack" }, text.trim());
          }}
          className="flex gap-2"
        >
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Describe your move, then pick an action…"
            aria-label="Describe your combat move"
            disabled={disabled}
            maxLength={500}
            className="h-9 flex-1 border-glass-border bg-[var(--input)] text-sm focus-visible:ring-[var(--gold)]"
          />
        </form>
      </div>

      {/* ── The story, when they want it ───────────────────────────────────── */}
      <AnimatePresence>
        {logOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => e.target === e.currentTarget && setLogOpen(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Narrative log"
              initial={{ scale: 0.95, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              className="glass-strong flex h-[80vh] w-full max-w-2xl flex-col rounded-2xl p-3"
            >
              <div className="flex shrink-0 items-center justify-between px-1 pb-2">
                <h2 className="text-xs uppercase tracking-[0.3em] text-cyan">Narrative log</h2>
                <Button variant="ghost" size="sm" autoFocus onClick={() => setLogOpen(false)} aria-label="Close the log" className="h-8 w-8 p-0">
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <NarrativeLog log={state.gameLog} playerName={player.name} thinking={busy} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
