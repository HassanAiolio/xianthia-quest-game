import os from "node:os";
import path from "node:path";

/** Server-only settings. Nothing in here is ever sent to the browser. */
export interface ServerConfig {
  groqApiKey?: string;
  hfToken?: string;
  imageCacheDir: string;
}

export function readConfig(env: Record<string, string | undefined>, root: string): ServerConfig {
  // Serverless file systems are read-only except the temp dir (Vercel: /tmp, per instance).
  const defaultCache = env.VERCEL ? path.join(os.tmpdir(), "xianthia-images") : path.join(root, ".cache/images");
  return {
    groqApiKey: env.GROQ_API_KEY?.trim() || undefined,
    hfToken: env.HF_TOKEN?.trim() || undefined,
    imageCacheDir: env.IMAGE_CACHE_DIR ? path.resolve(root, env.IMAGE_CACHE_DIR) : defaultCache,
  };
}
