import { describe, expect, it } from "vitest";
import { sanitizeNarration } from "./sanitize";
import { STARTER_ITEMS } from "./items";
import { makePlayer } from "./testing";
import { xpToNext } from "./stats";
import type { Quest } from "@/types/game";

const quests: Quest[] = [
  { id: "main-1", title: "Awaken", description: "", status: "active", main: true },
  { id: "side-1", title: "Find the cat", description: "", status: "active" },
];
const ctx = { player: makePlayer(), inventory: STARTER_ITEMS, quests, climaxReady: false };

describe("sanitizeNarration — the narrator proposes, the rules dispose", () => {
  it('caps a "gain 5000 XP and full heal" exploit', () => {
    const n = sanitizeNarration({ narrative: "ok", xpAward: 5000, hpDelta: 999, mpDelta: -999 }, ctx);
    expect(n.xpAward).toBe(Math.floor(xpToNext(1) * 0.1));
    expect(n.hpDelta).toBe(Math.floor(66 * 0.1));
    expect(n.mpDelta).toBe(-Math.floor(32 * 0.2));
  });

  it("scales a legendary item down to the level budget and keeps only one", () => {
    const n = sanitizeNarration(
      {
        narrative: "ok",
        itemsFound: [
          { name: "Godslayer", type: "weapon", description: "!!!", statBonus: { str: 50, int: 50, dex: 0, lck: 0 }, armorBonus: 30, healHp: 500, restoreMp: 0 },
          { name: "Second", type: "key", description: "", statBonus: { str: 0, int: 0, dex: 0, lck: 0 }, armorBonus: 0, healHp: 0, restoreMp: 0 },
        ],
      },
      ctx
    );
    expect(n.itemsFound).toHaveLength(1);
    const item = n.itemsFound[0];
    expect(Object.values(item.statBonus ?? {}).reduce((a, b) => a + (b ?? 0), 0)).toBe(1);
    expect(item.armorBonus).toBeUndefined();
    expect(item.effect).toBeUndefined();
  });

  it("caps consumable potency", () => {
    const n = sanitizeNarration(
      { narrative: "ok", itemsFound: [{ name: "Elixir", type: "consumable", description: "", statBonus: { str: 3 }, healHp: 9999, restoreMp: 0 }] },
      ctx
    );
    expect(n.itemsFound[0].effect).toEqual({ hp: Math.floor(66 * 0.4) });
    expect(n.itemsFound[0].statBonus).toBeUndefined();
  });

  it("downgrades an early boss to elite", () => {
    const n = sanitizeNarration({ narrative: "ok", encounter: { name: "Big Bad", imageDescription: "x", tier: "boss" } }, ctx);
    expect(n.encounter!.tier).toBe("elite");
    const ready = sanitizeNarration({ narrative: "ok", encounter: { name: "Big Bad", imageDescription: "x", tier: "boss" } }, { ...ctx, climaxReady: true });
    expect(ready.encounter!.tier).toBe("boss");
  });

  it("only completes real side quests, never the main story", () => {
    const n = sanitizeNarration({ narrative: "ok", completedQuestIds: ["main-1", "made-up", "side-1"] }, ctx);
    expect(n.completedQuestIds).toEqual(["side-1"]);
  });

  it("only consumes items the player owns and isn't wearing", () => {
    const n = sanitizeNarration({ narrative: "ok", itemsConsumed: ["starter-blade", "starter-stim", "ghost"] }, ctx);
    expect(n.itemsConsumed).toEqual(["starter-stim"]);
  });

  it("tolerates garbage", () => {
    const n = sanitizeNarration("not an object", ctx);
    expect(n).toMatchObject({ narrative: "", xpAward: 0, encounter: null, itemsFound: [], suggestions: [] });
  });
});
