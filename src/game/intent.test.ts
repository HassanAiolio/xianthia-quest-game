import { describe, expect, it } from "vitest";
import { parseCombatInput, parseExploreInput } from "./intent";
import { STARTER_ITEMS } from "./items";
import { makePlayer } from "./testing";

describe("parseExploreInput", () => {
  it("recognises resting only as the main verb", () => {
    expect(parseExploreInput("rest", STARTER_ITEMS)).toEqual({ kind: "rest" });
    expect(parseExploreInput("Take a short rest by the fire", STARTER_ITEMS)).toEqual({ kind: "rest" });
    expect(parseExploreInput("I rest my hand on the door", STARTER_ITEMS)).toEqual({ kind: "free" });
    expect(parseExploreInput("arrest the guard", STARTER_ITEMS)).toEqual({ kind: "free" });
  });

  it("maps 'use <consumable>' to the inventory item", () => {
    expect(parseExploreInput("use the neural stim", STARTER_ITEMS)).toEqual({ kind: "use-item", itemId: "starter-stim" });
    expect(parseExploreInput("inject stim!", STARTER_ITEMS)).toEqual({ kind: "use-item", itemId: "starter-stim" });
    // A weapon is not a consumable: that's a story action.
    expect(parseExploreInput("use the dagger to pry the panel", STARTER_ITEMS)).toEqual({ kind: "free" });
  });
});

describe("parseCombatInput", () => {
  const knight = makePlayer();
  const mage = makePlayer({ class: "Chrono-Mage" });
  it("reads the intent behind free text", () => {
    expect(parseCombatInput("I slash at its knees", knight, STARTER_ITEMS)).toEqual({ kind: "attack" });
    expect(parseCombatInput("run for the exit!", knight, STARTER_ITEMS)).toEqual({ kind: "flee" });
    expect(parseCombatInput("raise my guard and parry", knight, STARTER_ITEMS)).toEqual({ kind: "defend" });
    expect(parseCombatInput("use temporal cascade", mage, STARTER_ITEMS)).toEqual({ kind: "ability" });
    expect(parseCombatInput("Voidstrike!", knight, STARTER_ITEMS)).toEqual({ kind: "ability" });
    expect(parseCombatInput("drink my neural stim", knight, STARTER_ITEMS)).toEqual({ kind: "item", itemId: "starter-stim" });
  });
});
