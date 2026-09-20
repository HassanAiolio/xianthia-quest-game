import { describe, expect, it } from "vitest";
import { ALL_CHOICES, CHAPTERS, ENDINGS, chooseEnding } from "./story";
import { sanitizeNarration } from "./sanitize";
import { buildEpilogueMessages, buildNarrateMessages } from "./prompts";
import { playTurn } from "./engine";
import { applyTurn } from "./turn";
import { STARTER_ITEMS } from "./items";
import { makePlayer, makeState } from "./testing";
import type { AiRunner } from "@/services/ai";

const ctx = { player: makePlayer(), inventory: STARTER_ITEMS, quests: [], climaxReady: false };
const base = {
  narrative: "ok", suggestions: [], hpDelta: 0, mpDelta: 0, xpAward: 0, encounter: null, newLocation: null,
  itemsFound: [], itemsConsumed: [], newQuest: null, completedQuestIds: [], check: null,
  shardsFound: 0, merchant: null, companionJoins: null, companionLeaves: false, flagsSet: [],
};

describe("story choices", () => {
  it("every chapter offers decisions, and every ending requirement is a real one", () => {
    for (const ch of CHAPTERS) expect(ch.choices.length).toBeGreaterThan(0);
    const ids = new Set(ALL_CHOICES.map((c) => c.id));
    expect(ids.size).toBe(ALL_CHOICES.length); // no duplicates
    for (const ending of ENDINGS) for (const f of ending.requires) expect(ids.has(f)).toBe(true);
    expect(ENDINGS.at(-1)!.requires).toEqual([]); // always one that matches
  });

  it("keeps curated flags and drops invented ones", () => {
    const n = sanitizeNarration({ ...base, flagsSet: ["took-crown", "became-a-god", "spared-regent"] }, ctx);
    expect(n.flagsSet).toEqual(["took-crown", "spared-regent"]);
  });

  it("picks the most specific ending the player earned", () => {
    expect(chooseEnding([]).id).toBe("name-reclaimed");
    expect(chooseEnding(["freed-clocks"]).id).toBe("clockbreaker");
    expect(chooseEnding(["spared-regent", "paid-sable"]).id).toBe("mercy-of-hours");
    // Taking the crown outranks everything else.
    expect(chooseEnding(["freed-clocks", "spared-regent", "took-crown"]).id).toBe("new-regent");
  });
});

describe("remembering choices", () => {
  it("records a flag once and tells the player the world noticed", async () => {
    const ai: AiRunner = async () => ({ ...base, narrative: "You lower your blade.", flagsSet: ["spared-gatewarden"] });
    const state = makeState();
    const first = await playTurn(state, { kind: "text", text: "I spare it" }, { ai });
    expect(first.flags).toEqual(["spared-gatewarden"]);
    expect(first.logs.some((l) => l.text === "The Rift remembers: spared the gatewarden.")).toBe(true);

    const after = applyTurn(state, first);
    expect(after.flags).toEqual(["spared-gatewarden"]);

    // Setting it again changes nothing and says nothing.
    const second = await playTurn(after, { kind: "text", text: "I spare it again" }, { ai });
    expect(second.flags).toBeUndefined();
    expect(applyTurn(after, second).flags).toEqual(["spared-gatewarden"]);
  });

  it("tells the narrator what this chapter can be remembered for, and what already is", () => {
    const state = makeState({ chapter: 3, flags: ["cheated-sable"] });
    const [, user] = buildNarrateMessages(state, "look around");
    expect(user.content).toMatch(/took-crown: the player claims the Regent's power/);
    expect(user.content).toMatch(/ALREADY REMEMBERED: Cheated Mother Sable/);
  });
});

describe("epilogue", () => {
  it("writes victory from the ending the flags earned", () => {
    const state = makeState({ flags: ["took-crown", "cheated-sable"], chronicle: "Story: things happened." });
    const [system, user] = buildEpilogueMessages(state, "victory");
    expect(system.content).toMatch(/Write the epilogue/);
    expect(user.content).toMatch(/ENDING — "The New Regent"/);
    expect(user.content).toMatch(/Took the hollow crown; Cheated Mother Sable/);
  });

  it("closes a death run without a consolation prize", () => {
    const [, user] = buildEpilogueMessages(makeState({ player: makePlayer({ hp: 0 }) }), "death");
    expect(user.content).toMatch(/the player died here/);
    expect(user.content).toMatch(/No resurrection/);
  });
});
