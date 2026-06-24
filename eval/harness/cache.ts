// eval/harness/cache.ts
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type CacheKind = "llm" | "vision" | "weather" | "geocode" | "embeddings" | "other";

// Known LLM API hosts — any path on these hosts is an LLM call.
const LLM_HOSTS = ["api.deepseek.com", "api.openai.com", "api.anthropic.com"];

export function classify(url: string): CacheKind {
  const u = url.toLowerCase();
  if (u.includes("open-meteo.com")) return "weather";
  if (u.includes("photon.komoot.io") || u.includes("nominatim.openstreetmap.org")) return "geocode";
  if (u.includes("/embeddings")) return "embeddings";
  if (u.includes("/chat/completions")) {
    // Vision requests carry an image_url part; LLM (text) requests don't.
    return "llm"; // refined in installFetchCache where the body is available
  }
  // Host-based fallback: any call to a known LLM provider is an LLM request.
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (LLM_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return "llm";
  } catch {
    // unparseable URL — fall through to "other"
  }
  return "other";
}

type Stored = { status: number; headers: [string, string][]; body: string };

function keyFor(method: string, url: string, body: string): string {
  return createHash("sha256").update(`${method}\n${url}\n${body}`).digest("hex");
}

export function installFetchCache(opts: { dir: string; refresh: Set<CacheKind> | "all" }): () => void {
  mkdirSync(opts.dir, { recursive: true });
  const original = globalThis.fetch;

  const wrapped: typeof fetch = async (input, init) => {
    // Only the (string|URL, init) form is used by the app's cached calls.
    if (typeof input !== "string" && !(input instanceof URL)) return original(input, init);
    const url = input.toString();
    const method = (init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? init.body : "";

    let kind = classify(url);
    if (kind === "llm" && body.includes('"image_url"')) kind = "vision";

    const refreshing = opts.refresh === "all" || (opts.refresh as Set<CacheKind>).has(kind);
    const file = join(opts.dir, `${keyFor(method, url, body)}.json`);

    if (!refreshing && existsSync(file)) {
      const s = JSON.parse(readFileSync(file, "utf8")) as Stored;
      return new Response(s.body, { status: s.status, headers: s.headers });
    }
    const res = await original(input, init);
    const text = await res.clone().text();
    const stored: Stored = { status: res.status, headers: [...res.headers.entries()], body: text };
    writeFileSync(file, JSON.stringify(stored));
    return res;
  };

  globalThis.fetch = wrapped;
  return () => { globalThis.fetch = original; };
}
