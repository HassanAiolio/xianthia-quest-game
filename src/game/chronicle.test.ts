import { describe, expect, it } from "vitest";
import { pendingChronicle } from "./chronicle";
import { recentEntries } from "./prompts";
import { makeState } from "./testing";
import type { LogMessage } from "@/types/game";

const entries = (n: number): LogMessage[] =>
  Array.from({ length: n }, (_, i) => ({ id: `l${i}`, sender: i % 2 ? "AI" : "PLAYER", text: `event ${i}`, timestamp: i }));

describe("chronicle memory", () => {
  it("waits until enough story has piled up, then keeps the newest entries raw", () => {
    expect(pendingChronicle(makeState({ gameLog: entries(13) }))).toBeNull();
    const job = pendingChronicle(makeState({ gameLog: entries(14) }))!;
    expect(job.entries.map((e) => e.id)).toEqual(entries(8).map((e) => e.id));
    expect(job.upTo).toBe("l7");
  });

  it("resumes after the cursor and ignores dice lines", () => {
    const log = [...entries(20), { id: "roll", sender: "SYSTEM" as const, text: "d20", tone: "roll" as const, timestamp: 99 }];
    expect(pendingChronicle(makeState({ gameLog: log, chronicleUpTo: "l9" }))).toBeNull(); // only 10 new
    const job = pendingChronicle(makeState({ gameLog: [...log, ...entries(30).slice(20)], chronicleUpTo: "l9" }))!;
    expect(job.entries[0].id).toBe("l10");
    expect(job.entries.some((e) => e.tone === "roll")).toBe(false);
  });

  it("out-of-game errors never reach the AI (they once ended up in the chronicle)", () => {
    const error: LogMessage = { id: "err", sender: "SYSTEM", text: "The Aether-Core is overloaded. Try again in 13s.", tone: "error", timestamp: 50 };
    const log = [...entries(10), error, ...entries(14).slice(10)];
    expect(recentEntries(makeState({ gameLog: log })).some((m) => m.id === "err")).toBe(false);
    const job = pendingChronicle(makeState({ gameLog: [...log, ...entries(20).slice(14)] }))!;
    expect(job.entries.some((m) => m.id === "err")).toBe(false);
  });

  it("the narrator always sees every entry the chronicle doesn't cover yet", () => {
    const state = makeState({ gameLog: entries(20), chronicleUpTo: "l5" });
    const recent = recentEntries(state);
    expect(recent[0].id).toBe("l6");
    expect(recent.at(-1)!.id).toBe("l19");
  });
});
