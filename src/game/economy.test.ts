import { describe, expect, it, vi } from "vitest";
import { buyFromMerchant, canSell, generateStock, itemValue, sellPrice, sellToMerchant, shardReward } from "./economy";
import { createEnemy } from "./enemies";
import { playTurn } from "./engine";
import { applyTurn } from "./turn";
import { statBudget } from "./stats";
import { makePlayer, makeState, seededRng } from "./testing";
import type { Item, Merchant } from "@/types/game";
import type { AiRunner } from "@/services/ai";

const stock = (extra: Partial<Item> = {}, price = 30) => ({
  item: { id: "shop-1", name: "Riftglass Saber", type: "weapon" as const, description: "", statBonus: { str: 1 }, ...extra },
  price,
});
const merchant = (overrides: Partial<Merchant> = {}): Merchant => ({
  name: "Vell the Tinker",
  description: "Sells odds and ends.",
  location: "The Obsidian Antechamber",
  stock: [stock()],
  ...overrides,
});
const stamp = { id: "new-item", at: 5 };

describe("prices", () => {
  it("values gear by its bonuses and consumables by what they restore", () => {
    expect(itemValue({ id: "a", name: "x", type: "consumable", description: "", effect: { hp: 20 } })).toBe(18);
    expect(itemValue({ id: "b", name: "x", type: "weapon", description: "", statBonus: { str: 2 } })).toBe(75);
    expect(itemValue({ id: "c", name: "x", type: "key", description: "" })).toBe(0);
  });

  it("sells at 40%, and never sells keys or equipped gear", () => {
    const blade: Item = { id: "b", name: "x", type: "weapon", description: "", statBonus: { str: 1 } };
    expect(sellPrice(blade)).toBe(18);
    expect(canSell(blade)).toBe(true);
    expect(canSell({ ...blade, equipped: true })).toBe(false);
    expect(canSell({ id: "k", name: "key", type: "key", description: "" })).toBe(false);
  });

  it("pays more shards for tougher enemies", () => {
    const rng = seededRng(3);
    const minion = shardReward(createEnemy({ name: "m", imageDescription: "", tier: "minion" }, 1, "1"), 4, rng);
    const boss = shardReward(createEnemy({ name: "b", imageDescription: "", tier: "boss" }, 1, "2"), 4, rng);
    expect(minion).toBeGreaterThan(0);
    expect(boss).toBeGreaterThan(minion * 3);
  });

  it("stocks a merchant within the level's power budget", () => {
    const wares = generateStock(5, "Rift-Knight", seededRng(7));
    expect(wares).toHaveLength(5);
    for (const { item, price } of wares) {
      expect(price).toBe(itemValue(item));
      const stats = Object.values(item.statBonus ?? {}).reduce((a, b) => a + (b ?? 0), 0);
      expect(stats).toBeLessThanOrEqual(statBudget(5));
    }
  });
});

describe("trading", () => {
  it("buys when affordable and refuses when not", () => {
    const rich = makeState({ shards: 50, merchant: merchant() });
    const after = buyFromMerchant(rich, 0, stamp);
    expect(after.shards).toBe(20);
    expect(after.inventory.at(-1)).toMatchObject({ id: "new-item", name: "Riftglass Saber", equipped: false });
    expect(after.merchant!.stock).toHaveLength(0);
    expect(after.gameLog.at(-1)!.text).toBe("Bought Riftglass Saber for 30 shards.");

    const broke = makeState({ shards: 10, merchant: merchant() });
    expect(buyFromMerchant(broke, 0, stamp)).toBe(broke);
  });

  it("sells for 40% and lets the merchant resell it", () => {
    const state = makeState({ shards: 0, merchant: merchant({ stock: [] }) });
    const after = sellToMerchant(state, "starter-stim", stamp);
    expect(after.shards).toBe(sellPrice(state.inventory.find((i) => i.id === "starter-stim")!));
    expect(after.inventory.some((i) => i.id === "starter-stim")).toBe(false);
    expect(after.merchant!.stock[0].item.name).toBe("Neural Stim");
  });

  it("refuses to trade equipped gear or during a fight", () => {
    const state = makeState({ shards: 99, merchant: merchant() });
    expect(sellToMerchant(state, "starter-blade", stamp)).toBe(state); // equipped
    const fighting = { ...state, gameState: "COMBAT" as const, currentEnemy: createEnemy({ name: "x", imageDescription: "", tier: "minion" }, 1, "e") };
    expect(buyFromMerchant(fighting, 0, stamp)).toBe(fighting);
    expect(sellToMerchant(fighting, "starter-stim", stamp)).toBe(fighting);
  });
});

describe("world state", () => {
  const base = {
    narrative: "ok", suggestions: [], hpDelta: 0, mpDelta: 0, xpAward: 0, encounter: null, newLocation: null,
    itemsFound: [], itemsConsumed: [], newQuest: null, completedQuestIds: [], check: null,
    shardsFound: 0, merchant: null, companionJoins: null, companionLeaves: false,
  };

  it("caps the shards the narrator hands out", async () => {
    const ai: AiRunner = async () => ({ ...base, shardsFound: 9999 });
    const r = await playTurn(makeState(), { kind: "text", text: "loot the corpse" }, { ai });
    expect(r.shardsDelta).toBe(5 + 3 * 1);
    expect(applyTurn(makeState(), r).shards).toBe(8);
  });

  it("stocks a merchant the narrator introduces, and drops them when the player leaves", async () => {
    const ai: AiRunner = async () => ({ ...base, merchant: { name: "Vell", description: "A tinker." } });
    const r = await playTurn(makeState(), { kind: "text", text: "greet the tinker" }, { ai, rng: seededRng(2) });
    expect(r.merchant).toMatchObject({ name: "Vell", location: "The Obsidian Antechamber" });
    expect(r.merchant!.stock.length).toBeGreaterThan(0);

    const withMerchant = applyTurn(makeState(), r);
    const moved = applyTurn(withMerchant, {
      id: "t2", timestamp: 2, logs: [],
      location: { name: "Drowned Stair", description: "", imageDescription: "" },
    });
    expect(moved.merchant).toBeNull();
    expect(moved.visited.map((p) => p.name)).toEqual(["The Obsidian Antechamber", "Drowned Stair"]);
  });

  it("takes on one companion, and only one", async () => {
    const ai: AiRunner = async () => ({ ...base, companionJoins: { name: "Rook", role: "healer", description: "A field medic." } });
    const joined = applyTurn(makeState(), await playTurn(makeState(), { kind: "text", text: "ask Rook to come along" }, { ai }));
    expect(joined.companion).toMatchObject({ name: "Rook", role: "healer", hp: 26, down: false });

    const second = await playTurn(joined, { kind: "text", text: "ask someone else along" }, { ai });
    expect(second.companion).toBeUndefined();
  });

  it("levels the companion with the player and revives it on rest", async () => {
    const hurtAlly = { id: "a", name: "Rook", role: "fighter" as const, description: "", level: 1, hp: 0, maxHp: 26, down: true };
    const state = makeState({ companion: hurtAlly, player: makePlayer({ hp: 10, xp: 95 }) });
    const rested = applyTurn(state, await playTurn(state, { kind: "rest" }, { ai: async () => base, rng: () => 0.99 }));
    expect(rested.companion).toMatchObject({ down: false, hp: 13 });

    const levelled = applyTurn(rested, { id: "t3", timestamp: 3, logs: [], xpGain: 50 });
    expect(levelled.player!.level).toBe(2);
    expect(levelled.companion!.level).toBe(2);
    expect(levelled.companion!.maxHp).toBe(32);
  });

  it("pays shards for a kill and logs the new ability at level-up", async () => {
    const enemy = { ...createEnemy({ name: "Hound", imageDescription: "", tier: "standard" }, 1, "e"), hp: 1 };
    const state = makeState({ gameState: "COMBAT", currentEnemy: enemy, player: makePlayer({ level: 2, xp: 95 }) });
    const ai = vi.fn<AiRunner>().mockResolvedValue({ narrative: "It falls." });
    const r = await playTurn(state, { kind: "combat", action: { kind: "attack" } }, { ai, rng: seededRng(11) });
    expect(r.shardsDelta).toBeGreaterThan(0);

    const next = applyTurn(state, r);
    expect(next.shards).toBe(r.shardsDelta);
    expect(next.player!.level).toBe(3);
    expect(next.gameLog.some((m) => m.text.startsWith("New ability: Bulwark"))).toBe(true);
  });
});
