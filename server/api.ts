import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { readConfig, type ServerConfig } from "./config";
import { IMAGE_KINDS, ImageError, cacheKey, cachedImage, generateImage, type ImageKind } from "./images";
import { LlmError, TASKS, runTask, validateMessages, type TaskName } from "./llm";

type Next = (err?: unknown) => void;

/** Sliding-window limiter keyed by client IP. In-memory: fine for one dev/preview process. */
function rateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (ip: string): boolean => {
    const now = Date.now();
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) return false;
    recent.push(now);
    hits.set(ip, recent);
    return true;
  };
}

const allowLlm = rateLimiter(40, 60_000);
const allowImage = rateLimiter(25, 10 * 60_000);

function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage, maxBytes = 200_000): Promise<string> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new LlmError("body too large", 413);
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function handleLlm(cfg: ServerConfig, req: IncomingMessage, res: ServerResponse, ip: string) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "POST only" });
  if (!allowLlm(ip)) return sendJson(res, 429, { error: "Too many requests" }, { "Retry-After": "20" });
  try {
    const body = JSON.parse(await readBody(req));
    const task = body?.task as TaskName;
    if (!(task in TASKS)) return sendJson(res, 400, { error: "unknown task" });
    const data = await runTask(cfg, task, validateMessages(body.messages));
    sendJson(res, 200, { data });
  } catch (err) {
    if (err instanceof LlmError) {
      const headers: Record<string, string> = err.retryAfter ? { "Retry-After": String(err.retryAfter) } : {};
      return sendJson(res, err.status, { error: err.message, retryAfter: err.retryAfter }, headers);
    }
    if (err instanceof SyntaxError) return sendJson(res, 400, { error: "invalid JSON" });
    console.error("[api] llm", err);
    sendJson(res, 500, { error: "internal error" });
  }
}

async function handleImage(cfg: ServerConfig, url: URL, res: ServerResponse, ip: string) {
  const kind = url.searchParams.get("kind") as ImageKind;
  const subject = (url.searchParams.get("subject") ?? "").trim().slice(0, 300);
  const seed = Number.parseInt(url.searchParams.get("seed") ?? "0", 10) || 0;
  if (!(kind in IMAGE_KINDS) || !subject) return sendJson(res, 400, { error: "kind and subject are required" });

  const key = cacheKey(kind, subject, seed);
  try {
    let png = await cachedImage(cfg, key);
    if (!png) {
      if (!allowImage(ip)) return sendJson(res, 429, { error: "Too many image requests" }, { "Retry-After": "60" });
      png = await generateImage(cfg, kind, subject, key);
    }
    res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" });
    res.end(png);
  } catch (err) {
    const status = err instanceof ImageError ? err.status : 500;
    sendJson(res, status, { error: err instanceof Error ? err.message : "image failed" });
  }
}

export function createApiMiddleware(cfg: ServerConfig) {
  return async (req: IncomingMessage, res: ServerResponse, next: Next) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (!url.pathname.startsWith("/api/")) return next();
    const ip = req.socket.remoteAddress ?? "local";
    switch (url.pathname) {
      case "/api/status":
        return sendJson(res, 200, { llm: Boolean(cfg.groqApiKey), images: Boolean(cfg.hfToken) });
      case "/api/llm":
        return handleLlm(cfg, req, res, ip);
      case "/api/image":
        return handleImage(cfg, url, res, ip);
      default:
        return sendJson(res, 404, { error: "not found" });
    }
  };
}

/** Serves /api/* from `vite` (dev) and `vite preview`, so keys stay on the server. */
export function xianthiaApi(env: Record<string, string | undefined>, root: string): Plugin {
  const cfg = readConfig(env, root);
  return {
    name: "xianthia-api",
    configureServer(server) {
      server.middlewares.use(createApiMiddleware(cfg));
    },
    configurePreviewServer(server) {
      server.middlewares.use(createApiMiddleware(cfg));
    },
  };
}
