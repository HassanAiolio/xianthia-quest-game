import path from "node:path";

/** Server-only settings. Nothing in here is ever sent to the browser. */
export interface ServerConfig {
  groqApiKey?: string;
  hfToken?: string;
  imageCacheDir: string;
}

export function readConfig(env: Record<string, string | undefined>, root: string): ServerConfig {
  return {
    groqApiKey: env.GROQ_API_KEY?.trim() || undefined,
    hfToken: env.HF_TOKEN?.trim() || undefined,
    imageCacheDir: path.resolve(root, env.IMAGE_CACHE_DIR || ".cache/images"),
  };
}
