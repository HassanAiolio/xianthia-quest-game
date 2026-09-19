import { describe, expect, it } from "vitest";
import { gameReducer } from "./useGameStore";
import { createEnemy } from "@/game/enemies";
import { makePlayer, makeState } from "@/game/testing";

describe("gameReducer", () => {
  it("spending STR raises max HP like character creation does", () => {
    const s = makeState({ player: makePlayer({ statPoints: 1 }) });
    const next = gameReducer(s, { type: "SPEND_STAT_POINT", stat: "str" });
    expect(next.player).toMatchObject({ statPoints: 0, maxHp: 69, hp: 69 });
    expect(next.player!.stats.str).toBe(13);
    expect(gameReducer(next, { type: "SPEND_STAT_POINT", stat: "str" })).toBe(next); // no points left
  });

  it("gear can't be swapped mid-fight", () => {
    const enemy = createEnemy({ name: "x", imageDescription: "x", tier: "minion" }, 1, "e");
    const s = makeState({ gameState: "COMBAT", currentEnemy: enemy });
    expect(gameReducer(s, { type: "TOGGLE_EQUIP", itemId: "starter-blade" })).toBe(s);
    const calm = gameReducer(makeState(), { type: "TOGGLE_EQUIP", itemId: "starter-blade" });
    expect(calm.inventory.find((i) => i.id === "starter-blade")!.equipped).toBe(false);
  });

  it("drops a chronicle reply that belongs to an older run", () => {
    const s = makeState({ gameLog: [{ id: "a", sender: "AI", text: "x", timestamp: 1 }] });
    expect(gameReducer(s, { type: "UPDATE_CHRONICLE", text: "old", upTo: "zzz" })).toBe(s);
    expect(gameReducer(s, { type: "UPDATE_CHRONICLE", text: "new", upTo: "a" }).chronicle).toBe("new");
  });

  it("Continue resumes a saved fight", () => {
    const enemy = createEnemy({ name: "x", imageDescription: "x", tier: "minion" }, 1, "e");
    const s = makeState({ gameState: "LANDING", currentEnemy: enemy });
    expect(gameReducer(s, { type: "RESUME" }).gameState).toBe("COMBAT");
  });
});
