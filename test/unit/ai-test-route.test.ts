// The test-connection probe is the one place a provider's raw error text is
// forwarded to the browser, so the property worth pinning is: a rejected key
// still comes back as a 200 result, and `detail` never contains the key.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireOwnerMock, getAdminMock, getAiConfigMock } = vi.hoisted(() => ({
  requireOwnerMock: vi.fn(),
  getAdminMock: vi.fn(),
  getAiConfigMock: vi.fn(),
}));
vi.mock("@/lib/api/admin-auth", () => ({ requireOwner: requireOwnerMock }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminSupabase: getAdminMock }));
// getAiConfig is a Next `unstable_cache`, which needs a request-scoped
// incremental cache a unit test can't supply — mocked directly per test.
vi.mock("@/lib/ai-config", () => ({ getAiConfig: getAiConfigMock }));

import { POST } from "@/app/api/admin/settings/ai/test/route";

const SECRET_KEY = "sk-super-secret-do-not-leak";

const req = (body: unknown) =>
  new Request("http://x/api/admin/settings/ai/test", {
    method: "POST",
    body: JSON.stringify(body),
  });
const ctx = () => ({ params: Promise.resolve({}) });

function mockFetch(impl: () => unknown) {
  const fn = vi.fn(async () => impl());
  vi.stubGlobal("fetch", fn);
  return fn;
}

const baseCfg = {
  isAiConfigured: true,
  deepseekApiKey: SECRET_KEY,
  deepseekBaseUrl: "https://api.deepseek.com",
  deepseekModelFast: "deepseek-v4-flash",
  isEmbeddingsConfigured: true,
  embeddingApiKey: SECRET_KEY,
  embeddingBaseUrl: "https://api.openai.com/v1",
  embeddingModel: "text-embedding-3-small",
  isVisionConfigured: true,
  visionApiKey: SECRET_KEY,
  visionBaseUrl: "https://api.openai.com/v1",
  visionModel: "gpt-4o-mini",
};

beforeEach(() => {
  requireOwnerMock.mockReset();
  getAdminMock.mockReset();
  getAiConfigMock.mockReset();
  vi.unstubAllGlobals();
  requireOwnerMock.mockResolvedValue({ ok: true, self: "u1" });
  getAdminMock.mockReturnValue({});
});

describe("POST /api/admin/settings/ai/test", () => {
  it("403s a non-owner without calling the provider", async () => {
    requireOwnerMock.mockResolvedValue({ ok: false, status: 403 });
    const fetchFn = mockFetch(() => ({ ok: true }));
    const res = await POST(req({ group: "deepseek" }), ctx());
    expect(res.status).toBe(403);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("400s an unknown group", async () => {
    getAiConfigMock.mockResolvedValue(baseCfg);
    const res = await POST(req({ group: "openai" }), ctx());
    expect(res.status).toBe(400);
  });

  it("reports ok:true with the model id on a successful provider call", async () => {
    getAiConfigMock.mockResolvedValue(baseCfg);
    mockFetch(() => ({ ok: true }));
    const res = await POST(req({ group: "deepseek" }), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, detail: "deepseek-v4-flash" });
  });

  it("still answers 200 on a rejected key, and never echoes it in detail", async () => {
    getAiConfigMock.mockResolvedValue(baseCfg);
    mockFetch(() => ({ ok: false, status: 401, text: async () => "Invalid API key" }));
    const res = await POST(req({ group: "deepseek" }), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: false, reason: "rejected", detail: "401: Invalid API key" });
  });

  // Finding 2: a provider is an input the app doesn't control, and some
  // OpenAI-compatible APIs echo the submitted key back in a 401 body — the
  // "detail never contains the key" property has to hold against that text
  // too, not just against strings this route authors itself.
  it("redacts the configured key when a provider echoes it back in the error body", async () => {
    getAiConfigMock.mockResolvedValue(baseCfg);
    mockFetch(() => ({
      ok: false,
      status: 401,
      text: async () => `Invalid API key: ${SECRET_KEY} is not recognized`,
    }));
    const res = await POST(req({ group: "deepseek" }), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.detail).not.toContain(SECRET_KEY);
    expect(body.detail).toContain("[redacted]");
  });

  // Finding 2 (defense-in-depth): a provider that only PARTIALLY masks its own
  // echo (e.g. `sk-abc***xyz`) can never match the exact-key replace, since the
  // text on the wire is never byte-for-byte equal to the configured key. The
  // route also strips anything key-SHAPED regardless of an exact match, so
  // this residual case is still caught.
  it("redacts a key-shaped token even when it's only a masked fragment, not an exact match", async () => {
    getAiConfigMock.mockResolvedValue(baseCfg);
    mockFetch(() => ({
      ok: false,
      status: 401,
      text: async () => "Invalid API key: sk-ab12***XY89zz is not recognized",
    }));
    const res = await POST(req({ group: "deepseek" }), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.detail).not.toContain("sk-ab12***XY89zz");
    expect(body.detail).toContain("[redacted]");
  });

  // Finding 1: getAiConfig() runs before this route's own try/catch did in the
  // unfixed version, so a Supabase read failure escaped straight to
  // ownerRoute's catch-all and became a 502 — breaking the "always answer 200"
  // contract for a cause no different from a provider network failure.
  it("still answers 200 when getAiConfig() itself throws (a DB blip reading app_secrets)", async () => {
    getAiConfigMock.mockRejectedValue(new Error("fetch failed: getaddrinfo ENOTFOUND db.example.supabase.co"));
    const fetchFn = mockFetch(() => ({ ok: true }));
    const res = await POST(req({ group: "deepseek" }), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      reason: "failed",
      detail: "fetch failed: getaddrinfo ENOTFOUND db.example.supabase.co",
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("reports reason 'no-key' without calling the provider when the group isn't configured", async () => {
    getAiConfigMock.mockResolvedValue({ ...baseCfg, isEmbeddingsConfigured: false });
    const fetchFn = mockFetch(() => ({ ok: true }));
    const res = await POST(req({ group: "embedding" }), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, reason: "no-key", detail: "" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("turns a network failure (bad base URL, DNS, timeout) into a 200 result rather than a 502", async () => {
    getAiConfigMock.mockResolvedValue(baseCfg);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("fetch failed: ECONNREFUSED");
      }),
    );
    const res = await POST(req({ group: "vision" }), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: false, reason: "failed", detail: "fetch failed: ECONNREFUSED" });
  });
});
