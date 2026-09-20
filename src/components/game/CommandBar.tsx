import { useState, type FormEvent } from "react";
import { FlaskConical, Footprints, Moon, Send, Shield, Sparkles, Sword, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CheckPrompt } from "@/components/game/CheckPrompt";
import { Hint } from "@/components/game/Hint";
import { Input } from "@/components/ui/input";
import { useGameStore } from "@/hooks/useGameStore";
import { unlockedAbilities } from "@/game/abilities";
import type { CombatAction } from "@/game/combat";
import type { TurnInput } from "@/game/engine";

import { cn } from "@/lib/utils";

const DEFAULT_SUGGESTIONS = ["Look around", "Search the area", "Move on carefully"];

const chip =
  "h-auto min-h-9 whitespace-normal border-glass-border bg-[var(--glass)] py-1.5 text-left text-xs leading-snug hover:border-cyan/50 hover:bg-[color-mix(in_oklch,var(--cyan)_10%,transparent)] hover:text-cyan";

interface CommandBarProps {
  busy: boolean;
  /** Resolves false when the turn failed (e.g. narrator offline). */
  onPlay: (input: TurnInput, echo: string) => Promise<boolean>;
  onRollCheck: () => void;
}

export function CommandBar({ busy, onPlay, onRollCheck }: CommandBarProps) {
  const { state } = useGameStore();
  const [text, setText] = useState("");
  const [itemsOpen, setItemsOpen] = useState(false);
  const [abilitiesOpen, setAbilitiesOpen] = useState(false);
  const player = state.player!;
  const inCombat = state.gameState === "COMBAT" && state.currentEnemy !== null;
  const disabled = busy || state.gameState === "GAMEOVER";
  const consumables = state.inventory.filter((i) => i.type === "consumable");
  const abilities = unlockedAbilities(player);
  const cheapest = Math.min(...abilities.map((a) => a.mp));

  function submit(e: FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || disabled) return;
    setText("");
    // Give the words back if the turn failed, so retrying is one click.
    void onPlay({ kind: "text", text: t }, t).then((ok) => !ok && setText((cur) => cur || t));
  }

  function combat(action: CombatAction, label: string) {
    const flavour = text.trim();
    setText("");
    setItemsOpen(false);
    setAbilitiesOpen(false);
    void onPlay({ kind: "combat", action, text: flavour || undefined }, flavour || label).then(
      (ok) => !ok && flavour && setText((cur) => cur || flavour)
    );
  }

  const suggestions = state.suggestions.length ? state.suggestions : DEFAULT_SUGGESTIONS;
  const pending = state.pendingCheck;

  return (
    <div className="shrink-0 border-t border-glass-border p-3">
      {pending ? (
        <CheckPrompt check={pending} busy={busy} onRoll={onRollCheck} />
      ) : inCombat ? (
        <div className="mb-2 space-y-2">
          <Hint id="first-combat">
            A fight runs in rounds: strike, spend MP on an ability, brace to halve the next blow, drink something, or run for it. Every die is
            shown in the log — and you can describe your move in the box first.
          </Hint>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Button variant="outline" size="sm" disabled={disabled} onClick={() => combat({ kind: "attack" }, "Attack!")} className={chip}>
              <Sword /> Attack
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={disabled || player.mp < cheapest}
              aria-expanded={abilitiesOpen}
              title={player.mp < cheapest ? `Needs ${cheapest} MP` : undefined}
              onClick={() =>
                abilities.length === 1
                  ? combat({ kind: "ability", abilityId: abilities[0].id }, `${abilities[0].name}!`)
                  : setAbilitiesOpen((o) => !o)
              }
              className={cn(chip, "border-[var(--gold)]/40 text-[var(--gold)]")}
            >
              <Sparkles /> {abilities.length === 1 ? abilities[0].name : `Abilities (${abilities.length})`}
              <span className="text-[10px] opacity-70">{abilities.length === 1 ? `${abilities[0].mp} MP` : ""}</span>
            </Button>
            <Button variant="outline" size="sm" disabled={disabled} onClick={() => combat({ kind: "defend" }, "Defend.")} className={chip}>
              <Shield /> Defend
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={disabled || consumables.length === 0}
              aria-expanded={itemsOpen}
              onClick={() => setItemsOpen((o) => !o)}
              className={chip}
            >
              <FlaskConical /> Item ({consumables.length})
            </Button>
            <Button variant="outline" size="sm" disabled={disabled} onClick={() => combat({ kind: "flee" }, "Flee!")} className={chip}>
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
                  onClick={() => combat({ kind: "ability", abilityId: a.id }, `${a.name}!`)}
                  className={cn(chip, "border-[var(--gold)]/40 text-[var(--gold)]")}
                >
                  <Sparkles /> {a.name} <span className="text-[10px] opacity-70">{a.mp} MP</span>
                </Button>
              ))}
            </div>
          )}
          {itemsOpen && consumables.length > 0 && (
            <div className="flex flex-wrap gap-2 rounded-lg border border-glass-border bg-black/30 p-2" role="group" aria-label="Consumables">
              {consumables.map((item) => (
                <Button key={item.id} variant="outline" size="sm" disabled={disabled} onClick={() => combat({ kind: "item", itemId: item.id }, `Use ${item.name}.`)} className={chip}>
                  <FlaskConical /> {item.name}
                  <span className="text-[10px] text-muted-foreground">
                    {[item.effect?.hp && `+${item.effect.hp} HP`, item.effect?.mp && `+${item.effect.mp} MP`].filter(Boolean).join(" ")}
                  </span>
                </Button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="mb-2">
          <Hint id="first-action">
            Type anything you want to do — the Aether-Core answers whatever you try, not a fixed list. The buttons below are only
            suggestions.
          </Hint>
        </div>
      )}
      {!pending && !inCombat && (
        <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {suggestions.map((s) => (
            <Button key={s} variant="outline" size="sm" disabled={disabled} onClick={() => void onPlay({ kind: "text", text: s }, s)} className={chip}>
              <Wand2 className="text-cyan/70" /> {s}
            </Button>
          ))}
          <Button variant="outline" size="sm" disabled={disabled} onClick={() => void onPlay({ kind: "rest" }, "Rest.")} className={chip} title="Recover HP and MP. You might be ambushed.">
            <Moon /> Rest
          </Button>
        </div>
      )}

      <form onSubmit={submit} className="flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={pending ? "Roll the die to see what happens…" : inCombat ? "Describe your move, then pick an action (or just type it)…" : "What do you do?"}
          aria-label={inCombat ? "Describe your combat move" : "Your action"}
          disabled={disabled || Boolean(pending)}
          maxLength={500}
          className="h-11 flex-1 border-glass-border bg-[var(--input)] focus-visible:ring-[var(--gold)]"
        />
        <Button
          type="submit"
          aria-label="Send"
          disabled={disabled || Boolean(pending) || !text.trim()}
          className="h-11 bg-gradient-to-r from-[var(--gold)] to-[oklch(0.92_0.18_90)] px-4 font-display tracking-wider text-[var(--gold-foreground)] hover:opacity-95"
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
