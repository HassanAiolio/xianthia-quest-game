import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ServerConfig } from "./config";

// FLUX.1-schnell through the Hugging Face router (nscale provider).
// hf-inference itself dropped FLUX; nscale speaks the OpenAI images API.
const HF_IMAGES_URL = "https://router.huggingface.co/nscale/v1/images/generations";
const HF_MODEL = "black-forest-labs/FLUX.1-schnell";

export const IMAGE_KINDS = {
  portrait: {
    size: "512x512",
    prompt: (s: string) =>
      `pixel art 16-bit RPG character portrait, bust shot, ${s}, dark cyberpunk fantasy background, dramatic rim lighting, detailed face`,
  },
  enemy: {
    size: "512x512",
    prompt: (s: string) =>
      `pixel art 16-bit RPG enemy, ${s}, dark cyberpunk fantasy, menacing combat pose, dramatic lighting, dark background`,
  },
  scene: {
    size: "1024x448",
    prompt: (s: string) =>
      `pixel art 16-bit wide RPG background, ${s}, dark cyberpunk fantasy world, atmospheric, dramatic lighting, no people`,
  },
} as const;

export type ImageKind = keyof typeof IMAGE_KINDS;

export class ImageError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

// Concurrent requests for the same picture share one generation.
const inFlight = new Map<string, Promise<Buffer>>();

export function cacheKey(kind: ImageKind, subject: string, seed: number): string {
  return createHash("sha1").update(`${HF_MODEL}|${kind}|${seed}|${subject}`).digest("hex");
}

export async function cachedImage(cfg: ServerConfig, key: string): Promise<Buffer | null> {
  try {
    return await readFile(path.join(cfg.imageCacheDir, `${key}.png`));
  } catch {
    return null;
  }
}

export function generateImage(cfg: ServerConfig, kind: ImageKind, subject: string, key: string): Promise<Buffer> {
  const pending = inFlight.get(key);
  if (pending) return pending;
  const job = (async () => {
    if (!cfg.hfToken) throw new ImageError("HF_TOKEN is not set on the server", 503);
    const spec = IMAGE_KINDS[kind];
    const res = await fetch(HF_IMAGES_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.hfToken}` },
      body: JSON.stringify({
        model: HF_MODEL,
        prompt: spec.prompt(subject),
        size: spec.size,
        response_format: "b64_json",
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[api] image ${res.status}: ${detail.slice(0, 300)}`);
      // 402 = the Hugging Face account is out of inference credits.
      throw new ImageError(res.status === 402 ? "image credits exhausted" : `image provider error ${res.status}`, 502);
    }
    const data = await res.json();
    const b64 = data?.data?.[0]?.b64_json;
    if (typeof b64 !== "string") throw new ImageError("empty image reply", 502);
    const png = Buffer.from(b64, "base64");
    await mkdir(cfg.imageCacheDir, { recursive: true });
    await writeFile(path.join(cfg.imageCacheDir, `${key}.png`), png);
    return png;
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, job);
  return job;
}
