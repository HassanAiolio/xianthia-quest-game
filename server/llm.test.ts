import { afterEach, describe, expect, it, vi } from "vitest";
import { LlmError, TASKS, runTask, validateMessages } from "./llm.js";

const cfg = { groqApiKey: "test-key", imageCacheDir: "", ttsVoice: "troy" };
const ok = (content: object) =>
  new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }], usage: {} }), { status: 200 });
const limited = () => new Response("{}", { status: 429, headers: { "retry-after": "7" } });

afterEach(() => vi.unstubAllGlobals());

describe("runTask", () => {
  it("falls back to the next model when the first is rate-limited", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(limited()).mockResolvedValueOnce(ok({ narrative: "hi" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(runTask(cfg, "combat", [{ role: "user", content: "x" }])).resolves.toEqual({ narrative: "hi" });
    const models = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body).model);
    expect(models).toEqual(TASKS.combat.models);
  });

  it("reports a 429 with retry-after when every model is limited", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => limited()));
    await expect(runTask(cfg, "narrate", [{ role: "user", content: "x" }])).rejects.toMatchObject({ status: 429, retryAfter: 7 });
  });

  it("never sends a request without a key", async () => {
    await expect(runTask({ imageCacheDir: "", ttsVoice: "troy" }, "narrate", [{ role: "user", content: "x" }])).rejects.toBeInstanceOf(LlmError);
  });
});

describe("validateMessages", () => {
  it("rejects unknown roles and oversized prompts", () => {
    expect(() => validateMessages([{ role: "tool", content: "x" }])).toThrow(LlmError);
    expect(() => validateMessages([{ role: "user", content: "x".repeat(50_000) }])).toThrow(/too long/);
    expect(validateMessages([{ role: "user", content: "hi", extra: 1 }])).toEqual([{ role: "user", content: "hi" }]);
  });
});
