import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { readConfig, type ServerConfig } from "./config.js";
import { IMAGE_KINDS, ImageError, cacheKey, cachedImage, generateImage, type ImageKind } from "./images.js";
import { LlmError, TASKS, runTask, validateMessages, type TaskName } from "./llm.js";
import { TtsError, synthesize } from "./tts.js";

type Next = (err?: unknown) => void;

/** Sliding-window limiter keyed by client IP. In-memory, so per process / serverless instance. */
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
const allowTts = rateLimiter(30, 10 * 60_000);

function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers });
  res.end(JSON.stringify(body));
}

const MAX_BODY_BYTES = 200_000;

async function readJson(req: IncomingMessage): Promise<unknown> {
  // Vercel's Node helpers expose an already-parsed `req.body` (a getter that throws on bad JSON).
  let preParsed: unknown;
  try {
    preParsed = (req as IncomingMessage & { body?: unknown }).body;
  } catch {
    throw new SyntaxError("invalid JSON");
  }
  if (preParsed !== undefined && preParsed !== null) {
    if (typeof preParsed === "string" || Buffer.isBuffer(preParsed)) return JSON.parse(String(preParsed));
    if (JSON.stringify(preParsed).length > MAX_BODY_BYTES) throw new LlmError("body too large", 413);
    return preParsed;
  }
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new LlmError("body too large", 413);
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function clientIp(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
  return first || req.socket.remoteAddress || "local";
}

/** Browsers flag requests made by other websites; those have no business spending our quotas. */
const isCrossSite = (req: IncomingMessage) => req.headers["sec-fetch-site"] === "cross-site";

async function handleLlm(cfg: ServerConfig, req: IncomingMessage, res: ServerResponse, ip: string) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "POST only" });
  if (!allowLlm(ip)) return sendJson(res, 429, { error: "Too many requests" }, { "Retry-After": "20" });
  try {
    const body = (await readJson(req)) as { task?: TaskName; messages?: unknown } | null;
    const task = body?.task as TaskName;
    if (!(task in TASKS)) return sendJson(res, 400, { error: "unknown task" });
    const data = await runTask(cfg, task, validateMessages(body?.messages));
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

async function handleTts(cfg: ServerConfig, req: IncomingMessage, res: ServerResponse, ip: string) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "POST only" });
  if (!allowTts(ip)) return sendJson(res, 429, { error: "Too many voice requests" }, { "Retry-After": "60" });
  try {
    const body = (await readJson(req)) as { text?: unknown } | null;
    const text = typeof body?.text === "string" ? body.text : "";
    const wav = await synthesize(cfg, text);
    res.writeHead(200, { "Content-Type": "audio/wav", "Cache-Control": "no-store" });
    res.end(wav);
  } catch (err) {
    if (err instanceof TtsError) return sendJson(res, err.status, { error: err.message, code: err.code });
    if (err instanceof SyntaxError) return sendJson(res, 400, { error: "invalid JSON" });
    console.error("[api] tts", err);
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
    // Same URL = same picture forever: let browsers and the CDN keep it (s-maxage).
    res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable" });
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
    const ip = clientIp(req);
    if (url.pathname !== "/api/status" && isCrossSite(req)) return sendJson(res, 403, { error: "cross-site requests are not allowed" });
    switch (url.pathname) {
      case "/api/status":
        return sendJson(res, 200, { llm: Boolean(cfg.groqApiKey), images: Boolean(cfg.hfToken), voice: Boolean(cfg.groqApiKey) });
      case "/api/llm":
        return handleLlm(cfg, req, res, ip);
      case "/api/image":
        return handleImage(cfg, url, res, ip);
      case "/api/tts":
        return handleTts(cfg, req, res, ip);
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

/**
 * Handler for serverless functions (Vercel `api/*.ts`): same routes, keys read from process.env.
 * The config is read per request so newly added environment variables apply without a code change.
 */
export function serverlessHandler() {
  return (req: IncomingMessage, res: ServerResponse) =>
    createApiMiddleware(readConfig(process.env, process.cwd()))(req, res, () => sendJson(res, 404, { error: "not found" }));
}
