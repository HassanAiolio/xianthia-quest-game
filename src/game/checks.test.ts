import { describe, expect, it, vi } from "vitest";
import { DC, checkBonus, describeCheck, rollCheck } from "./checks";
import { playTurn } from "./engine";
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
    const r = await playTurn(makeState({ player: stalker }), { kind: "text", text: "climb the ledge" }, { ai, rng: scriptedRng([face(15)]) });

    expect(r.logs.map((l) => l.text)).toEqual([
      "You grip the ledge.",
      expect.stringMatching(/^DEX check \(medium\) — climb the ledge: d20 15 \+7 = 22 vs DC 13 — SUCCESS/),
      "You haul yourself over.",
      expect.stringMatching(/^\+\d+ XP$/),
    ]);
    expect(r.logs[1].dice?.[0]).toMatchObject({ natural: 15, target: 13, outcome: "success" });
    expect(r.xpGain).toBe(6); // the medium-check reward only; the narrator's extra 10 is ignored
    // The second call is told the verdict; a second check request is ignored.
    expect(ai).toHaveBeenCalledTimes(2);
    expect(ai.mock.calls[1][1][1].content).toMatch(/ABILITY CHECK RESOLVED .* was a SUCCESS/);
  });

  it("a failure earns no check XP", async () => {
    const ai = vi
      .fn<AiRunner>()
      .mockResolvedValueOnce({ ...base, narrative: "You lunge.", check: { stat: "str", difficulty: "hard", attempt: "force the door" } })
      .mockResolvedValueOnce({ ...base, narrative: "It holds." });
    const r = await playTurn(makeState({ player: stalker }), { kind: "text", text: "force it" }, { ai, rng: scriptedRng([face(2)]) });
    expect(r.xpGain).toBeUndefined();
    expect(ai.mock.calls[1][1][1].content).toMatch(/was a FAILURE/);
  });

  it("resting never triggers a check", async () => {
    const ai = vi.fn<AiRunner>().mockResolvedValue({ ...base, narrative: "You rest.", check: { stat: "lck", difficulty: "easy", attempt: "sleep" } });
    const state = makeState({ player: makePlayer({ hp: 10 }), inventory: STARTER_ITEMS });
    await playTurn(state, { kind: "rest" }, { ai, rng: () => 0.99 });
    expect(ai).toHaveBeenCalledTimes(1);
  });
});
