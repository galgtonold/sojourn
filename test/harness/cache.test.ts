// test/harness/cache.test.ts
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classify, installFetchCache, type CacheKind } from "../../eval/harness/cache";

const dir = mkdtempSync(join(tmpdir(), "evalcache-"));
afterEach(() => vi.unstubAllGlobals());
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function stubFetch() {
  let calls = 0;
  const fn = vi.fn(async () => {
    calls++;
    return new Response(JSON.stringify({ n: calls }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("cache", () => {
  it("classifies urls by host", () => {
    expect(classify("https://api.deepseek.com/chat/completions")).toBe("llm");
    expect(classify("https://api.open-meteo.com/v1/forecast?x=1")).toBe<CacheKind>("weather");
    expect(classify("https://photon.komoot.io/reverse?lat=1")).toBe("geocode");
  });

  it("replays an identical request and re-invokes on refresh", async () => {
    const real = stubFetch();
    const restore = installFetchCache({ dir, refresh: new Set() });
    const a = await (await fetch("https://api.deepseek.com/x", { method: "POST", body: "p" })).json();
    const b = await (await fetch("https://api.deepseek.com/x", { method: "POST", body: "p" })).json();
    expect(a).toEqual(b);            // replayed, not re-called
    expect(real).toHaveBeenCalledTimes(1);
    restore();

    const restore2 = installFetchCache({ dir, refresh: new Set<CacheKind>(["llm"]) });
    await fetch("https://api.deepseek.com/x", { method: "POST", body: "p" });
    expect(real).toHaveBeenCalledTimes(2); // refresh=llm forced a live call
    restore2();
  });
});
