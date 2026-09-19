import { useCallback, useState } from "react";
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { CommandBar } from "@/components/game/CommandBar";
import { DataPad } from "@/components/game/DataPad";
import { AtlasDialog } from "@/components/game/AtlasDialog";
import { DiceOverlay, isGoodRoll } from "@/components/game/DiceOverlay";
import { EnemyStrip } from "@/components/game/EnemyCard";
import { NarrativeLog } from "@/components/game/NarrativeLog";
import { EndOverlays, LevelUpToast } from "@/components/game/Overlays";
import { PlayerPanel } from "@/components/game/PlayerPanel";
import { SceneBanner } from "@/components/game/SceneBanner";
import { SoundControls } from "@/components/game/SoundControls";
import { useGameStore } from "@/hooks/useGameStore";
import { useChronicleKeeper } from "@/hooks/useChronicleKeeper";
import { useGameAudio } from "@/hooks/useGameAudio";
import { sound } from "@/audio/sound";
import { stopVoice } from "@/audio/voice";
import { playTurn, type TurnInput } from "@/game/engine";
import { makeLog } from "@/game/log";
import { describeAiError, runAi } from "@/services/ai";
import type { DiceRoll, Item } from "@/types/game";

export function GameView() {
  const { state, addLog, discardLog, applyTurnResult, setGameState, updateChronicle } = useGameStore();
  const [busy, setBusy] = useState(false);
  const [atlasOpen, setAtlasOpen] = useState(false);
  const shake = useAnimationControls();
  const reduceMotion = useReducedMotion();
  useChronicleKeeper(state, updateChronicle);
  useGameAudio(state);

  /** A die just landed in the overlay: play its sound, and shake on criticals. */
  const onDiceLand = useCallback(
    (d: DiceRoll) => {
      const good = isGoodRoll(d);
      if (d.kind === "attack") {
        if (d.who === "player") good ? sound.hit(d.outcome === "critical") : sound.miss();
        else good ? sound.miss() : sound.hurt();
      } else {
        good ? sound.success() : sound.failure();
      }
      if (!reduceMotion && (d.outcome === "critical" || (d.outcome === "fumble" && d.who === "player"))) {
        void shake.start({ x: [0, -7, 7, -5, 5, -2, 0], transition: { duration: 0.4 } });
      }
    },
    [shake, reduceMotion]
  );

  /** Plays one turn. Resolves false when it failed and nothing happened in the story. */
  const play = useCallback(
    async (input: TurnInput, echo: string): Promise<boolean> => {
      if (busy || !state.player) return false;
      sound.unlock();
      stopVoice(); // the player moved on
      const echoLog = makeLog("PLAYER", echo);
      addLog(echoLog);
      setBusy(true);
      try {
        // One atomic update per turn: HP, loot, enemy, mode and death are applied together.
        applyTurnResult(await playTurn(state, input, { ai: runAi }));
        return true;
      } catch (err) {
        console.warn(err);
        // The turn never happened: take the action back out of the story and explain why.
        discardLog(echoLog.id);
        addLog(makeLog("SYSTEM", describeAiError(err), "error"));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [busy, state, addLog, discardLog, applyTurnResult]
  );

  const player = state.player;
  if (!player) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Button onClick={() => setGameState("CHARACTER_CREATION")}>Create a character</Button>
      </div>
    );
  }

  const isLowHealth = player.hp > 0 && player.hp <= player.maxHp * 0.3;
  const useItem = (item: Item) => void play({ kind: "use-item", itemId: item.id }, `Use ${item.name}.`);

  return (
    <div className="relative flex min-h-screen flex-col px-3 py-4 sm:px-6 sm:py-6 lg:h-screen lg:overflow-hidden">
      <div className="pointer-events-none absolute inset-0" style={{ background: "var(--gradient-aurora)" }} />

      <AnimatePresence>
        {isLowHealth && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            aria-hidden
            className="pointer-events-none absolute inset-0 z-40 animate-pulse border-[6px] border-destructive/60 bg-[color-mix(in_oklch,var(--destructive)_5%,transparent)]"
          />
        )}
      </AnimatePresence>

      <motion.div
        animate={shake}
        className="relative mx-auto flex w-full max-w-[1500px] flex-1 flex-col gap-4 lg:grid lg:min-h-0 lg:grid-cols-[280px_1fr_320px]"
      >
        <PlayerPanel />

        <main className="order-1 flex flex-col gap-4 lg:order-2 lg:min-h-0">
          <SceneBanner onOpenAtlas={() => setAtlasOpen(true)} />
          {state.gameState === "COMBAT" && state.currentEnemy && <EnemyStrip enemy={state.currentEnemy} />}
          <div className="glass-strong relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-glass-border px-4 py-2">
              <div className="text-xs uppercase tracking-[0.3em] text-cyan">Narrative log</div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-muted-foreground">{state.gameLog.length} entries</span>
                <SoundControls />
              </div>
            </div>
            <DiceOverlay log={state.gameLog} onRoll={() => sound.dice()} onLand={onDiceLand} />
            <NarrativeLog log={state.gameLog} playerName={player.name} thinking={busy} />
            <CommandBar busy={busy} onPlay={play} />
          </div>
        </main>

        <DataPad busy={busy} onUseItem={useItem} />
      </motion.div>

      <AnimatePresence>
        {atlasOpen && (
          <AtlasDialog
            onClose={() => setAtlasOpen(false)}
            onTravel={(name) => void play({ kind: "text", text: `Travel back to ${name}.` }, `Travel back to ${name}.`)}
          />
        )}
      </AnimatePresence>

      <LevelUpToast level={player.level} />
      <EndOverlays />
    </div>
  );
}
