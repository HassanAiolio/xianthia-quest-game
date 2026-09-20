import { describe, expect, it } from "vitest";
import { buildLegend, legendText } from "./legend";
import { buildNarrateMessages } from "./prompts";
import { beatHooks, drawBeats, getChapter } from "./story";
import { applyTurn } from "./turn";
import { makePlayer, makeState, seededRng } from "./testing";

const turn = (over: Record<string, unknown> = {}) => ({ id: "t", timestamp: 1, logs: [], ...over });

describe("replay threads", () => {
  it("draws two different threads from the chapter pool", () => {
    for (let chapter = 1; chapter <= 3; chapter++) {
      const drawn = drawBeats(chapter, seededRng(chapter));
      const pool = getChapter(chapter)!.beats.map((b) => b.id);
      expect(drawn).toHaveLength(2);
      expect(new Set(drawn).size).toBe(2);
      drawn.forEach((id) => expect(pool).toContain(id));
    }
  });

  it("does not hand every run the same chapter", () => {
    const draws = new Set(Array.from({ length: 30 }, (_, i) => drawBeats(1, seededRng(i + 1)).join("+")));
    expect(draws.size).toBeGreaterThan(1);
  });

  it("hands the drawn threads to the narrator", () => {
    const state = makeState({ chapter: 1, beats: ["glass-orphan"] });
    const prompt = buildNarrateMessages(state, "Look around")
      .map((m) => m.content)
      .join(" ");
    expect(prompt).toContain("THREADS DRAWN FOR THIS RUN");
    expect(prompt).toContain("A child of blown glass");
    // A thread the run did not draw stays out of this playthrough.
    expect(prompt).not.toContain("only opens for a memory");
  });

  it("turns thread ids into hooks for the narrator, ignoring stale ones", () => {
    const [first] = getChapter(2)!.beats;
    expect(beatHooks(2, [first.id, "no-such-beat"])).toEqual([first.hook]);
  });

  it("draws fresh threads when a chapter is completed", () => {
    const state = makeState({ chapter: 1, beats: ["cartographer", "mirror-well"] });
    const next = applyTurn(state, turn({ chapterComplete: true }));
    expect(next.chapter).toBe(2);
    const pool = getChapter(2)!.beats.map((b) => b.id);
    next.beats.forEach((id) => expect(pool).toContain(id));
  });
});

describe("the run's tally", () => {
  it("counts turns, kills, bosses, shards and the hardest blow", () => {
    let state = makeState();
    state = applyTurn(state, turn({ damageDealt: 11, kill: true, shardsDelta: 12 }));
    state = applyTurn(state, turn({ damageDealt: 30, chapterComplete: true, kill: true, shardsDelta: 40 }));
    state = applyTurn(state, turn({ damageDealt: 4, shardsDelta: -5 }));
    expect(state.stats).toMatchObject({ turns: 3, kills: 2, bosses: 1, biggestHit: 30, shardsEarned: 52 });
  });
});

describe("the legend", () => {
  const finished = () =>
    makeState({
      player: makePlayer({ name: "Nia", class: "Chrono-Mage", level: 7 }),
      difficulty: "hardcore",
      chapter: 4,
      flags: ["spared-regent", "freed-clocks"],
      epilogue: { id: "mercy-of-hours", title: "The Mercy of Hours", text: "The clocks turn, and Nia walks out of the Spire." },
      stats: { turns: 42, kills: 9, bosses: 3, biggestHit: 57, shardsEarned: 310, started: Date.now() - 2 * 86_400_000 },
    });

  it("reads back the run at a glance", () => {
    const legend = buildLegend(finished());
    expect(legend.title).toBe("The Legend of Nia");
    expect(legend.subtitle).toContain("Chrono-Mage, level 7");
    expect(legend.subtitle).toContain("Hardcore");
    expect(legend.lines).toContainEqual({ label: "Hardest blow", value: "57 damage" });
    expect(legend.lines).toContainEqual({ label: "Chapters", value: "3 of 3" });
    expect(legend.lines).toContainEqual({ label: "Days in the Rift", value: "2" });
    expect(legend.choices).toEqual(["Spared the Hollow Regent", "Let time run again"]);
  });

  it("says where a run ended when it ended badly", () => {
    const dead = makeState({ gameState: "GAMEOVER", chapter: 2, player: makePlayer({ name: "Kel" }) });
    expect(buildLegend(dead).subtitle).toContain("fell in The Drowned Market");
  });

  it("copies as plain text, ending with the game it came from", () => {
    const text = legendText(finished());
    expect(text.startsWith("The Legend of Nia")).toBe(true);
    expect(text).toContain("Foes defeated: 9");
    expect(text).toContain("- Spared the Hollow Regent");
    expect(text).toContain("The clocks turn");
    expect(text.trimEnd().endsWith("Xianthia Quest")).toBe(true);
  });
});
