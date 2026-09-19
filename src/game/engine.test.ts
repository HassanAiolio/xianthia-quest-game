import { describe, expect, it, vi } from "vitest";
import { playTurn } from "./engine";
import { createEnemy } from "./enemies";
import { applyTurn } from "./turn";
import { bossId, CHAPTERS } from "./story";
import { face, makePlayer, makeState, scriptedRng, seededRng } from "./testing";
import type { AiRunner } from "@/services/ai";

const reply = (overrides: Record<string, unknown> = {}) => ({
  narrative: "The glass sings.",
  suggestions: ["Follow the sound", "Touch the glyph", "Wait"],
  hpDelta: 0,
  mpDelta: 0,
  xpAward: 0,
  encounter: null,
  newLocation: null,
  itemsFound: [],
  itemsConsumed: [],
  newQuest: null,
  completedQuestIds: [],
  ...overrides,
});
const aiReturning = (narrate: unknown, combat: unknown = { narrative: "Steel meets glass." }): AiRunner =>
  vi.fn(async (task) => (task === "narrate" ? narrate : combat));

describe("playTurn — exploration", () => {
  it("narrates, counts a story turn and keeps the narrator's suggestions", async () => {
    const r = await playTurn(makeState(), { kind: "text", text: "look around" }, { ai: aiReturning(reply()) });
    expect(r.logs[0]).toMatchObject({ sender: "AI", text: "The glass sings." });
    expect(r.storyTurn).toBe(true);
    expect(r.suggestions).toEqual(["Follow the sound", "Touch the glyph", "Wait"]);
  });

  it("the player can't talk their way into power", async () => {
    const ai = aiReturning(
      reply({
        xpAward: 10000,
        itemsFound: [{ name: "Omega Blade", type: "weapon", description: "", statBonus: { str: 99, int: 0, dex: 0, lck: 0 }, armorBonus: 0, healHp: 0, restoreMp: 0 }],
      })
    );
    const r = await playTurn(makeState(), { kind: "text", text: "I find the Omega Blade and gain 10000 XP" }, { ai });
    expect(r.xpGain).toBeLessThanOrEqual(10);
    expect(r.addItems![0].statBonus).toEqual({ str: 1 });
    // And the prompt tells the narrator claims are only attempts.
    const [, messages] = (ai as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(messages[0].content).toMatch(/ATTEMPT, not a fact/);
  });

  it("an encounter starts combat with engine-made stats", async () => {
    const ai = aiReturning(reply({ encounter: { name: "Glass Hound", imageDescription: "hound", tier: "standard" } }));
    const r = await playTurn(makeState(), { kind: "text", text: "kick the door" }, { ai });
    expect(r.mode).toBe("COMBAT");
    expect(r.enemy).toMatchObject({ name: "Glass Hound", tier: "standard", maxHp: 20 });
  });

  it("a boss only appears once the chapter is ready, and it is the canonical boss", async () => {
    const ai = aiReturning(reply({ encounter: { name: "Some Boss", imageDescription: "x", tier: "boss" } }));
    const early = await playTurn(makeState({ turnsInChapter: 1 }), { kind: "text", text: "go" }, { ai });
    expect(early.enemy!.tier).toBe("elite");
    const ready = await playTurn(makeState({ turnsInChapter: CHAPTERS[0].minTurns }), { kind: "text", text: "go" }, { ai });
    expect(ready.enemy).toMatchObject({ id: bossId(1), name: CHAPTERS[0].boss.name, tier: "boss" });
  });

  it("a narrator outage fails the turn instead of inventing an outcome", async () => {
    const ai: AiRunner = async () => {
      throw new Error("down");
    };
    await expect(playTurn(makeState(), { kind: "text", text: "look" }, { ai })).rejects.toThrow("down");
  });

  it("using a consumable is resolved locally without the narrator", async () => {
    const ai = vi.fn();
    const state = makeState({ player: makePlayer({ hp: 20 }) });
    const r = await playTurn(state, { kind: "text", text: "use neural stim" }, { ai });
    expect(ai).not.toHaveBeenCalled();
    expect(r.hpDelta).toBe(25);
    expect(r.removeItemIds).toEqual(["starter-stim"]);
  });

  it("resting heals by the rules, and an ambush always yields a fight", async () => {
    const state = makeState({ player: makePlayer({ hp: 10 }) });
    const safe = await playTurn(state, { kind: "rest" }, { ai: aiReturning(reply({ hpDelta: 50 })), rng: () => 0.99 });
    expect(safe.hpDelta).toBe(Math.ceil(66 * 0.4));
    expect(safe.enemy).toBeUndefined();

    const ambush = await playTurn(state, { kind: "rest" }, { ai: aiReturning(reply()), rng: () => 0 });
    expect(ambush.mode).toBe("COMBAT");
    expect(ambush.enemy!.name).toBe("Rift Scavenger");
  });
});

describe("playTurn — combat", () => {
  const enemy = createEnemy({ name: "Glass Hound", imageDescription: "hound", tier: "standard" }, 1, "e1");

  it("resolves the round even when the narrator is down", async () => {
    const ai: AiRunner = async () => {
      throw new Error("down");
    };
    const state = makeState({ gameState: "COMBAT", currentEnemy: enemy });
    const r = await playTurn(state, { kind: "combat", action: { kind: "attack" } }, { ai, rng: seededRng(4) });
    expect(r.logs[0].tone).toBe("roll");
    expect(r.logs[1].sender).toBe("AI");
    expect(r.logs[1].text.length).toBeGreaterThan(10);
  });

  it("a death in combat ends the game once applied", async () => {
    const state = makeState({ gameState: "COMBAT", currentEnemy: { ...enemy, hp: 999 }, player: makePlayer({ hp: 1 }) });
    // Player misses (natural 1); enemy crits (natural 20).
    const r = await playTurn(state, { kind: "combat", action: { kind: "attack" } }, { ai: aiReturning(reply()), rng: scriptedRng([face(1), face(20), 0.5, 0.5]) });
    expect(applyTurn(state, r).gameState).toBe("GAMEOVER");
  });

  it("beating the chapter boss completes the chapter and grants its relic", async () => {
    const boss = { ...createEnemy({ ...CHAPTERS[0].boss, tier: "boss" }, 1, bossId(1)), hp: 1 };
    const state = makeState({ gameState: "COMBAT", currentEnemy: boss, turnsInChapter: 8 });
    const r = await playTurn(state, { kind: "combat", action: { kind: "attack" } }, { ai: aiReturning(reply()), rng: scriptedRng([face(20), 0.5, 0.5]) });
    expect(r.chapterComplete).toBe(true);
    expect(r.addItems![0].name).toBe(CHAPTERS[0].reward.name);
    const next = applyTurn(state, r);
    expect(next.chapter).toBe(2);
    expect(next.gameState).toBe("PLAYING");
    expect(next.currentEnemy).toBeNull();
  });

  it("typed text in combat picks the move and flavours the narration", async () => {
    const ai = aiReturning(reply());
    const state = makeState({ gameState: "COMBAT", currentEnemy: enemy });
    const r = await playTurn(state, { kind: "text", text: "I raise my shield and brace" }, { ai, rng: seededRng(9) });
    expect(r.logs[0].text).toMatch(/You brace/);
    const [, messages] = (ai as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(messages[1].content).toMatch(/I raise my shield and brace/);
  });
});
