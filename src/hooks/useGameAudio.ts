import { useEffect, useRef } from "react";
import type { GameSnapshot } from "@/types/game";
import { sound, type MusicMode } from "@/audio/sound";
import { speak, stopVoice } from "@/audio/voice";

/**
 * Music follows the game mode; fresh log entries trigger sounds and the narrator voice.
 * Dice sounds are driven by the DiceOverlay so they land with the animation.
 */
export function useGameAudio(state: GameSnapshot) {
  const enemy = state.currentEnemy;
  const mode: MusicMode =
    state.gameState === "GAMEOVER" ? "off" : state.gameState === "COMBAT" && enemy ? (enemy.tier === "boss" ? "boss" : "combat") : "explore";

  useEffect(() => sound.setMode(mode), [mode]);
  useEffect(
    () => () => {
      sound.setMode("off");
      stopVoice();
    },
    []
  );

  const previousState = useRef(state.gameState);
  useEffect(() => {
    if (state.gameState !== previousState.current) {
      if (state.gameState === "GAMEOVER") sound.death();
      if (state.gameState === "VICTORY") sound.victory();
    }
    previousState.current = state.gameState;
  }, [state.gameState]);

  const lastSeen = useRef(state.gameLog.at(-1)?.id);
  useEffect(() => {
    const log = state.gameLog;
    const from = lastSeen.current ? log.findIndex((m) => m.id === lastSeen.current) + 1 : 0;
    lastSeen.current = log.at(-1)?.id;
    for (const m of log.slice(from)) {
      if (m.sender === "AI") speak(m.text);
      else if (m.tone === "danger" && /encounter/i.test(m.text)) sound.encounter();
      else if (m.tone === "reward" && m.text.startsWith("LEVEL UP")) sound.levelUp();
      else if (m.tone === "reward") sound.reward();
    }
  }, [state.gameLog]);
}
