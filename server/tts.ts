import type { ServerConfig } from "./config.js";

const GROQ_TTS_URL = "https://api.groq.com/openai/v1/audio/speech";
const TTS_MODEL = "canopylabs/orpheus-v1-english";
const MAX_CHARS = 900;

export class TtsError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
}

/** Trim to a speakable length, ending on a sentence boundary when possible. */
export function speakableText(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= MAX_CHARS) return clean;
  const cut = clean.slice(0, MAX_CHARS);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return end > MAX_CHARS * 0.5 ? cut.slice(0, end + 1) : cut;
}

/** Narrator voice via Groq's Orpheus text-to-speech. Returns WAV bytes. */
export async function synthesize(cfg: ServerConfig, text: string): Promise<Buffer> {
  if (!cfg.groqApiKey) throw new TtsError("GROQ_API_KEY is not set on the server", 503);
  const input = speakableText(text);
  if (!input) throw new TtsError("nothing to say", 400);

  const res = await fetch(GROQ_TTS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.groqApiKey}` },
    body: JSON.stringify({ model: TTS_MODEL, voice: cfg.ttsVoice, input, response_format: "wav" }),
  });
  if (res.ok) return Buffer.from(await res.arrayBuffer());

  const detail = await res.json().catch(() => ({}));
  const code: string | undefined = detail?.error?.code;
  if (code === "model_terms_required") {
    // One-time step for the account owner: accept the model terms in the Groq playground.
    throw new TtsError("Narrator voice needs the Orpheus model terms accepted in the Groq console", 503, code);
  }
  if (res.status === 429) throw new TtsError("voice rate limited", 429, code);
  console.error(`[api] tts ${res.status}: ${JSON.stringify(detail).slice(0, 300)}`);
  throw new TtsError(`voice provider error ${res.status}`, 502, code);
}
