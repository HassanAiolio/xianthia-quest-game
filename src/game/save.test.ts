import { describe, expect, it } from "vitest";
import { STORAGE_KEY, loadSnapshot, migrate, resumeState, saveSnapshot } from "./save";
import { makeState } from "./testing";

function memoryStorage(seed: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(seed));
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
    clear: () => data.clear(),
    key: (i) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
}

// Shape written by the original (v1) app.
const V1_SAVE = {
  gameState: "COMBAT",
  player: {
    name: "Veyra", class: "Neural-Stalker", stats: { str: 5, int: 6, dex: 15, lck: 4 },
    hp: 70, maxHp: 90, mp: 50, maxMp: 60, xp: 40, level: 2, statPoints: 0,
    portraitUrl: "https://image.pollinations.ai/prompt/x?seed=1",
  },
  inventory: [
    { id: "starter-blade", name: "Sliverlight Dagger", type: "weapon", description: "Hums.", statBonus: { str: 1 } },
    { id: "starter-stim", name: "Neural Stim", type: "consumable", description: "Single-use. Restores 25 HP." },
    { id: "unique-id", name: "Glass Key", type: "key", description: "Cold." },
    { id: "unique-id", name: "Odd Coin", type: "artifact", description: "Warm." },
  ],
  gameLog: [{ id: "log-1", sender: "PLAYER", text: "look", timestamp: 1 }],
  currentLocation: { name: "Hall", description: "Dark.", imageDescription: "dark hall" },
  quests: [{ id: "q1", title: "Awaken in Xianthia", description: "Find a way out.", status: "active" }],
  currentEnemy: { id: "enemy-1", name: "Neon Synth", hp: 25, maxHp: 50, minDamage: 4, maxDamage: 8, imageDescription: "synth" },
};

describe("save migration", () => {
  it("upgrades a v1 save", () => {
    const s = migrate(V1_SAVE)!;
    expect(s.version).toBe(2);
    expect(s.player!.portraitUrl).toBeUndefined();
    expect(s.quests[0]).toMatchObject({ id: "main-1", main: true });
    expect(s.inventory.find((i) => i.id === "starter-blade")!.equipped).toBe(true);
    expect(s.inventory.find((i) => i.id === "starter-stim")!.effect).toEqual({ hp: 25 });
    expect(new Set(s.inventory.map((i) => i.id)).size).toBe(4);
    // Rebuilt with the real rules; its remaining HP carries over, capped at the new max.
    const enemy = s.currentEnemy!;
    expect(enemy).toMatchObject({ name: "Neon Synth", tier: "standard" });
    expect(enemy.hp).toBe(Math.min(25, enemy.maxHp));
    expect(typeof enemy.ac).toBe("number");
  });

  it("opens on the title screen and Continue resumes the fight", () => {
    const storage = memoryStorage({ "xianthia-quest:v1": JSON.stringify(V1_SAVE) });
    const s = loadSnapshot(storage);
    expect(s.gameState).toBe("LANDING");
    expect(s.player!.name).toBe("Veyra");
    expect(resumeState(s)).toBe("COMBAT");
  });

  it("round-trips a v2 save", () => {
    const storage = memoryStorage();
    const original = makeState({ chronicle: "Story: things happened.", chapter: 2, turnsInChapter: 3 });
    saveSnapshot(original, storage);
    expect(storage.getItem(STORAGE_KEY)).toBeTruthy();
    const loaded = loadSnapshot(storage);
    expect(loaded).toMatchObject({ chronicle: "Story: things happened.", chapter: 2, turnsInChapter: 3 });
    expect(loaded.player).toEqual(original.player);
  });

  it("offers nothing to resume for a dead hero or an empty slot", () => {
    expect(resumeState(makeState({ player: null }))).toBeNull();
    const dead = makeState();
    dead.player!.hp = 0;
    expect(resumeState(dead)).toBeNull();
  });

  it("survives a corrupt save", () => {
    const s = loadSnapshot(memoryStorage({ [STORAGE_KEY]: "{not json" }));
    expect(s.player).toBeNull();
  });
});
