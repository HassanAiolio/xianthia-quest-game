import { describe, expect, it, vi } from "vitest";
import { DC, checkBonus, describeCheck, rollCheck } from "./checks";
import { narrateCheckOutcome, playTurn, rollPendingCheck } from "./engine";
import { applyTurn } from "./turn";
import { STARTER_ITEMS } from "./items";
import { sanitizeCheck } from "./sanitize";
import { face, makePlayer, makeState, scriptedRng, seededRng } from "./testing";
import type { AiRunner } from "@/services/ai";

const stalker = makePlayer({ class: "Neural-Stalker", stats: { str: 5, int: 6, dex: 15, lck: 4 } });

describe("ability checks", () => {
  it("the class's own stat gets proficiency", () => {
    expect(checkBonus(stalker, [], "dex")).toBe(5 + 2); // mod 5 + proficiency 2
    expect(checkBonus(stalker, [], "str")).toBe(0);
  });

  it("natural 20 always succeeds critically, natural 1 always fails critically", () => {
    const req = { stat: "str" as const, difficulty: "extreme" as const, attempt: "lift the gate" };
    expect(rollCheck(stalker, [], req, scriptedRng([face(20)]))).toMatchObject({ success: true, critical: true });
    const easy = { ...req, difficulty: "easy" as const };
    expect(rollCheck(stalker, [], { ...easy, stat: "dex" }, scriptedRng([face(1)]))).toMatchObject({ success: false, critical: true });
  });

  it("success odds follow the difficulty (specialist vs medium ≈ 75%, off-stat vs hard ≈ 25%)", () => {
    const rate = (stat: "dex" | "str", difficulty: "medium" | "hard") => {
      const rng = seededRng(5);
      let wins = 0;
      for (let i = 0; i < 4000; i++) if (rollCheck(stalker, [], { stat, difficulty, attempt: "x" }, rng).success) wins++;
      return wins / 4000;
    };
    expect(rate("dex", "medium")).toBeGreaterThan(0.68);
    expect(rate("dex", "medium")).toBeLessThan(0.82);
    expect(rate("str", "hard")).toBeGreaterThan(0.2);
    expect(rate("str", "hard")).toBeLessThan(0.32);
  });

  it("describes the roll for the log", () => {
    const r = rollCheck(stalker, [], { stat: "dex", difficulty: "medium", attempt: "slip past the sentry" }, scriptedRng([face(9)]));
    expect(describeCheck(r)).toBe(`DEX check (medium) — slip past the sentry: d20 9 +7 = 16 vs DC ${DC.medium} — SUCCESS`);
  });

  it("rejects malformed check requests", () => {
    expect(sanitizeCheck({ check: { stat: "cha", difficulty: "hard", attempt: "charm" } })).toBeNull();
    expect(sanitizeCheck({ check: { stat: "dex", difficulty: "absurd", attempt: "jump" } })).toEqual({ stat: "dex", difficulty: "medium", attempt: "jump" });
    expect(sanitizeCheck({ check: null })).toBeNull();
  });
});

describe("engine — check flow", () => {
  const base = { suggestions: ["a", "b", "c"], hpDelta: 0, mpDelta: 0, xpAward: 0, encounter: null, newLocation: null, itemsFound: [], itemsConsumed: [], newQuest: null, completedQuestIds: [] };

  it("asks, rolls, then narrates the outcome it was told", async () => {
    const ai = vi
      .fn<AiRunner>()
      .mockResolvedValueOnce({ ...base, narrative: "You grip the ledge.", check: { stat: "dex", difficulty: "medium", attempt: "climb the ledge" } })
      .mockResolvedValueOnce({ ...base, narrative: "You haul yourself over.", xpAward: 10, check: { stat: "str", difficulty: "hard", attempt: "again" } });
    const start = makeState({ player: stalker });

    // 1. The narrator sets the scene and hands the die over — no roll yet.
    const asked = await playTurn(start, { kind: "text", text: "climb the ledge" }, { ai });
    expect(asked.logs.map((l) => l.text)).toEqual(["You grip the ledge."]);
    expect(asked.pendingCheck).toMatchObject({ stat: "dex", attempt: "climb the ledge", dc: 13, bonus: 7, action: "climb the ledge" });
    expect(ai).toHaveBeenCalledTimes(1);

    const waiting = applyTurn(start, asked);
    expect(waiting.pendingCheck).not.toBeNull();

    // 2. The player rolls: the die and its XP land immediately.
    const { result, turn } = rollPendingCheck(waiting, scriptedRng([face(15)]));
    expect(result.success).toBe(true);
    expect(turn.logs[0].text).toMatch(/^DEX check \(medium\) — climb the ledge: d20 15 \+7 = 22 vs DC 13 — SUCCESS/);
    expect(turn.logs[0].dice?.[0]).toMatchObject({ natural: 15, target: 13, outcome: "success", manual: true });
    expect(turn.xpGain).toBe(6);
    expect(turn.pendingCheck).toBeNull();
    const rolled = applyTurn(waiting, turn);
    expect(rolled.pendingCheck).toBeNull();

    // 3. The narrator is told the verdict and carries on; no second check, no extra XP.
    const outcome = await narrateCheckOutcome(rolled, waiting.pendingCheck!, result, { ai });
    expect(outcome.logs[0].text).toBe("You haul yourself over.");
    expect(outcome.xpGain).toBeUndefined();
    expect(outcome.pendingCheck).toBeUndefined();
    expect(outcome.storyTurn).toBe(true);
    expect(ai.mock.calls[1][1][1].content).toMatch(/ABILITY CHECK RESOLVED .* was a SUCCESS/);
  });

  it("a failure earns no check XP", async () => {
    const ai = vi
      .fn<AiRunner>()
      .mockResolvedValueOnce({ ...base, narrative: "You lunge.", check: { stat: "str", difficulty: "hard", attempt: "force the door" } })
      .mockResolvedValueOnce({ ...base, narrative: "It holds." });
    const start = makeState({ player: stalker });
    const waiting = applyTurn(start, await playTurn(start, { kind: "text", text: "force it" }, { ai }));
    const { result, turn } = rollPendingCheck(waiting, scriptedRng([face(2)]));
    expect(result.success).toBe(false);
    expect(turn.xpGain).toBeUndefined();

    await narrateCheckOutcome(applyTurn(waiting, turn), waiting.pendingCheck!, result, { ai });
    expect(ai.mock.calls[1][1][1].content).toMatch(/was a FAILURE/);
  });

  it("resting never triggers a check", async () => {
    const ai = vi.fn<AiRunner>().mockResolvedValue({ ...base, narrative: "You rest.", check: { stat: "lck", difficulty: "easy", attempt: "sleep" } });
    const state = makeState({ player: makePlayer({ hp: 10 }), inventory: STARTER_ITEMS });
    await playTurn(state, { kind: "rest" }, { ai, rng: () => 0.99 });
    expect(ai).toHaveBeenCalledTimes(1);
  });
});
