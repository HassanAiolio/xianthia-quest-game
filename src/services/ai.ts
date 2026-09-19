import type { ChatMessage } from "@/game/prompts";

export type AiTask = "narrate" | "combat" | "chronicle";
/** Injected into the engine so tests can replace the network. */
export type AiRunner = (task: AiTask, messages: ChatMessage[]) => Promise<unknown>;

export class AiError extends Error {
  constructor(message: string, readonly status: number, readonly retryAfter?: number) {
    super(message);
  }
}

/** Calls the server proxy (/api/llm). The Groq key never leaves the server. */
export const runAi: AiRunner = async (task, messages) => {
  let res: Response;
  try {
    res = await fetch("/api/llm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task, messages }),
    });
  } catch {
    throw new AiError("network error", 0);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new AiError(body.error ?? `HTTP ${res.status}`, res.status, body.retryAfter);
  return body.data;
};

export function describeAiError(err: unknown): string {
  if (err instanceof AiError) {
    if (err.status === 429) return `The Aether-Core is overloaded. Try again in ${err.retryAfter ?? 20}s.`;
    if (err.status === 503) return "The Aether-Core is offline: GROQ_API_KEY is not set on the server.";
    if (err.status === 404) return "The Aether-Core can't be found: this deployment has no game server (/api).";
    if (err.status === 0) return "Connection to the Aether-Core lost. Check your connection and try again.";
  }
  return "The Aether-Core's signal broke up. Try again.";
}
