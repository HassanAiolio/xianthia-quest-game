import { rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiMiddleware, serverlessHandler } from "./api.js";

const cfg = { groqApiKey: "test-key", hfToken: undefined, imageCacheDir: "" };

function request(url: string, opts: { method?: string; body?: string; parsedBody?: unknown; headers?: Record<string, string> } = {}) {
  const req = Readable.from(opts.body ? [Buffer.from(opts.body)] : []) as unknown as IncomingMessage & { body?: unknown };
  Object.assign(req, { url, method: opts.method ?? "GET", headers: opts.headers ?? {}, socket: { remoteAddress: "127.0.0.1" } });
  if (opts.parsedBody !== undefined) req.body = opts.parsedBody; // what Vercel's helpers provide
  return req;
}

function response() {
  const out = { status: 0, headers: {} as Record<string, string>, body: "" };
  const res = {
    writeHead(status: number, headers: Record<string, string>) {
      out.status = status;
      out.headers = headers;
      return res;
    },
    end(chunk?: string | Buffer) {
      out.body = chunk ? String(chunk) : "";
    },
  } as unknown as ServerResponse;
  return { res, out };
}

const groqReply = () =>
  new Response(JSON.stringify({ choices: [{ message: { content: '{"narrative":"ok"}' } }], usage: {} }), { status: 200 });
const llmBody = { task: "combat", messages: [{ role: "user", content: "hit it" }] };

afterEach(() => vi.unstubAllGlobals());

describe("API middleware", () => {
  it("reports which keys are configured", async () => {
    const { res, out } = response();
    await createApiMiddleware(cfg)(request("/api/status"), res, () => {});
    expect(out.status).toBe(200);
    expect(JSON.parse(out.body)).toEqual({ llm: true, images: false });
  });

  it("accepts a streamed JSON body (Vite dev / preview)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(groqReply()));
    const { res, out } = response();
    await createApiMiddleware(cfg)(request("/api/llm", { method: "POST", body: JSON.stringify(llmBody) }), res, () => {});
    expect(out.status).toBe(200);
    expect(JSON.parse(out.body)).toEqual({ data: { narrative: "ok" } });
  });

  it("accepts a body Vercel already parsed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(groqReply()));
    const { res, out } = response();
    await createApiMiddleware(cfg)(request("/api/llm", { method: "POST", parsedBody: llmBody }), res, () => {});
    expect(out.status).toBe(200);
  });

  it("refuses browser requests coming from other websites", async () => {
    const { res, out } = response();
    await createApiMiddleware(cfg)(request("/api/llm", { method: "POST", parsedBody: llmBody, headers: { "sec-fetch-site": "cross-site" } }), res, () => {});
    expect(out.status).toBe(403);
  });

  it("lets the CDN cache generated images", async () => {
    // Serve from a cache miss → generation is mocked by stubbing fetch to the provider.
    const png = Buffer.from("fakepng");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: png.toString("base64") }] }))));
    // A cache dir *inside a file* can never be created, on any OS: the write fails, the image must not.
    const blocker = path.join(os.tmpdir(), `xq-not-a-dir-${process.pid}`);
    writeFileSync(blocker, "");
    const { res, out } = response();
    await createApiMiddleware({ ...cfg, hfToken: "hf", imageCacheDir: path.join(blocker, "images") })(
      request("/api/image?kind=enemy&seed=3&subject=glass%20hound"),
      res,
      () => {}
    );
    expect(out.status).toBe(200);
    expect(out.headers["Cache-Control"]).toMatch(/s-maxage=/);
    rmSync(blocker, { force: true });
  });

  it("serverless handler answers unknown routes with 404", async () => {
    const { res, out } = response();
    await serverlessHandler()(request("/api/nope"), res);
    expect(out.status).toBe(404);
  });
});
