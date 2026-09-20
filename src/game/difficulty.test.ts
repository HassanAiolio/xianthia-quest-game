import { describe, expect, it } from "vitest";
import { DIFFICULTIES, NEAR_DEATH_HP, rulesFor } from "./difficulty";
import { resolveCombatRound } from "./combat";
import { createEnemy } from "./enemies";
import { playTurn } from "./engine";
import { applyTurn } from "./turn";
import { simulateFights, typicalPlayer } from "./simulate";
import { makePlayer, makeState, seededRng } from "./testing";
import type { AiRunner } from "@/services/ai";

const lethal = { id: "t", timestamp: 1, logs: [], hpDelta: -999 };

describe("difficulty", () => {
  it("falls back to normal for an unknown mode", () => {
    expect(rulesFor("normal")).toBe(DIFFICULTIES.normal);
    expect(rulesFor("nonsense" as never)).toBe(DIFFICULTIES.normal);
  });

  it("ends the run on Normal and Hardcore", () => {
    for (const difficulty of ["normal", "hardcore"] as const) {
      const state = makeState({ difficulty, player: makePlayer({ hp: 12 }) });
      const next = applyTurn(state, lethal);
      expect(next.gameState).toBe("GAMEOVER");
      expect(next.player!.hp).toBe(0);
    }
  });

  it("Story mode pulls the player back, and charges shards for it", () => {
    const state = makeState({ difficulty: "story", player: makePlayer({ hp: 12 }), shards: 40 });
    const next = applyTurn(state, lethal);
    expect(next.gameState).not.toBe("GAMEOVER");
    expect(next.player!.hp).toBe(Math.ceil(next.player!.maxHp * NEAR_DEATH_HP));
    expect(next.shards).toBe(30);
    expect(next.gameLog.at(-1)!.text).toMatch(/The Rift refuses you/);
  });

  it("scales enemy damage: Story softer, Hardcore harder", async () => {
    const ai: AiRunner = async () => ({
      narrative: "Something lunges.", suggestions: [], hpDelta: 0, mpDelta: 0, xpAward: 0,
      encounter: { name: "Hound", imageDescription: "hound", tier: "standard" },
      newLocation: null, itemsFound: [], itemsConsumed: [], newQuest: null, completedQuestIds: [],
      check: null, shardsFound: 0, merchant: null, companionJoins: null, companionLeaves: false, flagsSet: [],
    });
    const hpLost = async (difficulty: "story" | "normal" | "hardcore") => {
      const r = await playTurn(makeState({ difficulty }), { kind: "text", text: "pick a fight" }, { ai });
      const enemy = r.enemy!;
      const player = makePlayer({ hp: 9999, maxHp: 9999 });
      const rng = seededRng(17);
      let total = 0;
      for (let i = 0; i < 400; i++) total += -resolveCombatRound(player, [], enemy, { kind: "defend" }, rng).hpDelta;
      return total;
    };
    const [story, normal, hardcore] = [await hpLost("story"), await hpLost("normal"), await hpLost("hardcore")];
    expect(story).toBeLessThan(normal);
    expect(hardcore).toBeGreaterThan(normal);
  });

  it("rest mends less on Hardcore, and is interrupted more often", async () => {
    const ai: AiRunner = async () => ({ narrative: "You rest.", suggestions: [], hpDelta: 0, mpDelta: 0, xpAward: 0, encounter: null, newLocation: null, itemsFound: [], itemsConsumed: [], newQuest: null, completedQuestIds: [], check: null, shardsFound: 0, merchant: null, companionJoins: null, companionLeaves: false, flagsSet: [] });
    const healed = async (difficulty: "story" | "hardcore") => {
      const state = makeState({ difficulty, player: makePlayer({ hp: 1 }) });
      const r = await playTurn(state, { kind: "rest" }, { ai, rng: () => 0.99 });
      return r.hpDelta!;
    };
    expect(await healed("hardcore")).toBeLessThan(await healed("story"));
    expect(DIFFICULTIES.hardcore.ambush).toBeGreaterThan(DIFFICULTIES.story.ambush);
  });

  it("a Hardcore fight costs meaningfully more HP than a Story one", () => {
    const p = typicalPlayer("Chrono-Mage", 5);
    const soft = createEnemy({ name: "x", imageDescription: "x", tier: "standard" }, 5, "e", { damageScale: DIFFICULTIES.story.enemyDamage });
    const hard = createEnemy({ name: "x", imageDescription: "x", tier: "standard" }, 5, "e", { damageScale: DIFFICULTIES.hardcore.enemyDamage });
    expect(hard.damageScale!).toBeGreaterThan(soft.damageScale!);
    // Sanity: the standard fight is still winnable at the hard end.
    const stats = simulateFights({ ...p }, "standard", 1500, seededRng(4));
    expect(stats.winRate).toBeGreaterThan(0.95);
  });
});
