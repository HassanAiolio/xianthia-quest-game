import type { ServerConfig } from "./config.js";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// ── JSON schemas (Groq strict structured outputs) ────────────────────────────
// Strict mode guarantees the reply parses and matches the shape, but the values
// are still the model's proposals — the client clamps every number it applies.

const str = { type: "string" } as const;
const int = { type: "integer" } as const;
const nullable = (schema: object) => ({ anyOf: [schema, { type: "null" }] });
const obj = (properties: Record<string, object>) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});

const NARRATE_SCHEMA = obj({
  narrative: str,
  suggestions: { type: "array", items: str },
  hpDelta: int,
  mpDelta: int,
  xpAward: int,
  encounter: nullable(
    obj({
      name: str,
      imageDescription: str,
      tier: { type: "string", enum: ["minion", "standard", "elite", "boss"] },
      ranged: { type: "boolean" },
    })
  ),
  newLocation: nullable(obj({ name: str, description: str, imageDescription: str })),
  itemsFound: {
    type: "array",
    items: obj({
      name: str,
      type: { type: "string", enum: ["weapon", "armor", "consumable", "artifact", "key"] },
      description: str,
      statBonus: obj({ str: int, int: int, dex: int, lck: int }),
      armorBonus: int,
      healHp: int,
      restoreMp: int,
    }),
  },
  itemsConsumed: { type: "array", items: str },
  newQuest: nullable(obj({ title: str, description: str })),
  completedQuestIds: { type: "array", items: str },
  check: nullable(
    obj({
      stat: { type: "string", enum: ["str", "int", "dex", "lck"] },
      difficulty: { type: "string", enum: ["easy", "medium", "hard", "extreme"] },
      attempt: str,
    })
  ),
  shardsFound: int,
  flagsSet: { type: "array", items: str },
  merchant: nullable(obj({ name: str, description: str })),
  companionJoins: nullable(
    obj({ name: str, role: { type: "string", enum: ["fighter", "healer", "mystic"] }, description: str })
  ),
  companionLeaves: { type: "boolean" },
});

const COMBAT_SCHEMA = obj({ narrative: str });
const EPILOGUE_SCHEMA = obj({ epilogue: str });
const CHRONICLE_SCHEMA = obj({ chronicle: str });

interface TaskSpec {
  /** Tried in order: when one model is rate-limited (429), the next one takes the call. */
  models: string[];
  schema: object;
  maxTokens: number;
  temperature: number;
}

// Groq's free tier allows ~8,000 tokens per minute *per model* (a narrate call is ~2,200).
// Budgets stay close to measured reply sizes (narrate ~250–400 tokens incl. reasoning,
// combat ~150, chronicle ~150–280) and tasks are spread across two models, each with its
// own quota, so a burst of turns falls back instead of locking the narrator out.
const BIG = "openai/gpt-oss-120b";
const SMALL = "openai/gpt-oss-20b";

/** The only calls the proxy will make. Models, schema and token budget are fixed server-side. */
export const TASKS = {
  narrate: { models: [BIG, SMALL], schema: NARRATE_SCHEMA, maxTokens: 900, temperature: 0.85 },
  combat: { models: [SMALL, BIG], schema: COMBAT_SCHEMA, maxTokens: 400, temperature: 0.9 },
  chronicle: { models: [SMALL, BIG], schema: CHRONICLE_SCHEMA, maxTokens: 600, temperature: 0.3 },
  epilogue: { models: [BIG, SMALL], schema: EPILOGUE_SCHEMA, maxTokens: 900, temperature: 0.9 },
} satisfies Record<string, TaskSpec>;

export type TaskName = keyof typeof TASKS;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class LlmError extends Error {
  constructor(message: string, readonly status: number, readonly retryAfter?: number) {
    super(message);
  }
}

const MAX_MESSAGES = 30;
const MAX_TOTAL_CHARS = 40_000;

export function validateMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MESSAGES) {
    throw new LlmError("messages must be a non-empty array", 400);
  }
  let total = 0;
  const messages = value.map((m) => {
    const role = (m as ChatMessage)?.role;
    const content = (m as ChatMessage)?.content;
    if (!["system", "user", "assistant"].includes(role) || typeof content !== "string") {
      throw new LlmError("invalid message", 400);
    }
    total += content.length;
    return { role, content };
  });
  if (total > MAX_TOTAL_CHARS) throw new LlmError("prompt too long", 413);
  return messages;
}

async function callModel(cfg: ServerConfig, task: TaskName, model: string, messages: ChatMessage[]): Promise<Response> {
  const spec = TASKS[task];
  return fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.groqApiKey}` },
    body: JSON.stringify({
      model,
      messages,
      temperature: spec.temperature,
      max_completion_tokens: spec.maxTokens,
      reasoning_effort: "low",
      response_format: {
        type: "json_schema",
        json_schema: { name: task, strict: true, schema: spec.schema },
      },
    }),
  });
}

export async function runTask(cfg: ServerConfig, task: TaskName, messages: ChatMessage[]): Promise<unknown> {
  if (!cfg.groqApiKey) throw new LlmError("GROQ_API_KEY is not set on the server", 503);
  const { models } = TASKS[task];
  let retryAfter = 0;

  for (const model of models) {
    // Strict mode can still fail validation on rare occasions (HTTP 400): one retry covers it.
    for (let attempt = 0; attempt < 2; attempt++) {
      const started = Date.now();
      const res = await callModel(cfg, task, model, messages);

      if (res.ok) {
        const data = await res.json();
        const u = data.usage ?? {};
        console.info(
          `[api] ${task} ${model} ${Date.now() - started}ms · tokens in ${u.prompt_tokens} out ${u.completion_tokens} (reasoning ${u.completion_tokens_details?.reasoning_tokens ?? "?"})`
        );
        const content = data.choices?.[0]?.message?.content;
        if (typeof content !== "string") throw new LlmError("empty model reply", 502);
        return JSON.parse(content);
      }

      const detail = await res.text().catch(() => "");
      if (res.status === 429) {
        retryAfter = Math.max(retryAfter, Number(res.headers.get("retry-after")) || 10);
        console.warn(`[api] ${task} ${model} rate-limited (retry after ${retryAfter}s)${model === models.at(-1) ? "" : ", trying next model"}`);
        break; // next model
      }
      if (attempt === 0 && (res.status === 400 || res.status >= 500)) continue;
      console.error(`[api] Groq ${res.status}: ${detail.slice(0, 500)}`);
      throw new LlmError(`Groq error ${res.status}`, 502);
    }
  }
  throw new LlmError("rate limited by Groq", 429, retryAfter);
}
