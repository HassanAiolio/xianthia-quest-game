import { describe, expect, it } from "vitest";
import { applyTurn, type TurnResult } from "./turn";
import { createEnemy } from "./enemies";
import { makePlayer, makeState } from "./testing";
import { xpToNext } from "./stats";
import { CHAPTERS, mainQuestId } from "./story";

const turn = (extra: Partial<TurnResult>): TurnResult => ({ id: "t1", timestamp: 1, logs: [], ...extra });
const enemy = createEnemy({ name: "Synth", imageDescription: "x", tier: "standard" }, 1, "e1");

describe("applyTurn", () => {
  it("a lethal hit ends the game even when the turn asks to stay in combat (v1 bug)", () => {
    const state = makeState({ gameState: "COMBAT", currentEnemy: enemy, player: makePlayer({ hp: 5 }) });
    const next = applyTurn(state, turn({ hpDelta: -10, enemy: { ...enemy, hp: 20 }, mode: "COMBAT" }));
    expect(next.player!.hp).toBe(0);
    expect(next.gameState).toBe("GAMEOVER");
  });

  it("levels up with a full restore, a stat point and a log line", () => {
    const state = makeState({ player: makePlayer({ hp: 10, mp: 2, xp: 90 }) });
    const next = applyTurn(state, turn({ xpGain: 30 }));
    const p = next.player!;
    expect(p.level).toBe(2);
    expect(p.xp).toBe(90 + 30 - xpToNext(1));
    expect(p.statPoints).toBe(1);
    expect(p.maxHp).toBe(66 + 11);
    expect(p.hp).toBe(p.maxHp);
    expect(p.mp).toBe(p.maxMp);
    expect(next.gameLog.at(-1)!.text).toMatch(/LEVEL UP: level 2/);
  });

  it("does not level-up-heal a player who died this turn", () => {
    const state = makeState({ player: makePlayer({ hp: 3, xp: 95 }) });
    const next = applyTurn(state, turn({ hpDelta: -8, xpGain: 50 }));
    expect(next.gameState).toBe("GAMEOVER");
    expect(next.player!.hp).toBe(0);
    expect(next.player!.level).toBe(1);
  });

  it("completing a chapter closes its main quest and opens the next", () => {
    const next = applyTurn(makeState({ turnsInChapter: 9 }), turn({ chapterComplete: true, enemy: null, mode: "PLAYING" }));
    expect(next.chapter).toBe(2);
    expect(next.turnsInChapter).toBe(0);
    expect(next.quests.find((q) => q.id === mainQuestId(1))!.status).toBe("completed");
    expect(next.quests.find((q) => q.id === mainQuestId(2))!.status).toBe("active");
    expect(next.gameState).toBe("PLAYING");
  });

  it("finishing the last chapter is a victory", () => {
    const next = applyTurn(makeState({ chapter: CHAPTERS.length }), turn({ chapterComplete: true, mode: "PLAYING" }));
    expect(next.gameState).toBe("VICTORY");
  });

  it("respects the inventory cap", () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ id: `i${i}`, name: `Thing ${i}`, type: "key" as const, description: "" }));
    const next = applyTurn(makeState({ inventory: items }), turn({ addItems: [{ id: "new", name: "Extra", type: "key", description: "" }] }));
    expect(next.inventory).toHaveLength(12);
    expect(next.gameLog.at(-1)!.text).toMatch(/Inventory full/);
  });
});
