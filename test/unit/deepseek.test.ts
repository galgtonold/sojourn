import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { deepseekChat } from "@/lib/ai/deepseek";

// getAiConfig is a Next `unstable_cache`, which needs a request-scoped
// incremental cache a unit test can't supply — so mock it to the pure resolver.
// The key still comes from the env the setup file sets (DEEPSEEK_API_KEY =
// "test-key"), so isAiConfigured is true exactly as before; the model IDs are
// pinned here so the alias -> ID mapping is visible in the assertions below.
vi.mock("@/lib/ai-config", async () => {
  const { readAiEnv, resolveAiConfig } = await import("@/lib/ai-config-fields");
  return {
    AI_CONFIG_TAG: "ai-config",
    getAiConfig: async () =>
      resolveAiConfig(
        { deepseekModelFast: "deepseek-chat", deepseekModelReasoner: "deepseek-reasoner" },
        readAiEnv(),
      ),
  };
});

// We mock global fetch to exercise request shaping + response handling.
function mockFetch(impl: (url: string, init: RequestInit) => unknown) {
  const fn = vi.fn(async (url: string, init: RequestInit) => impl(url, init));
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("deepseekChat", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it("posts to the chat endpoint with auth + returns the message content", async () => {
    const fetchFn = mockFetch(() => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "hello" } }] }),
    }));

    const out = await deepseekChat({
      model: "fast",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(out).toBe("hello");
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toContain("/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer test-key",
    );
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("deepseek-chat");
    expect(body.response_format).toBeUndefined();
  });

  it("requests JSON mode when json:true", async () => {
    const fetchFn = mockFetch(() => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "{}" } }] }),
    }));
    await deepseekChat({
      model: "fast",
      messages: [{ role: "user", content: "x" }],
      json: true,
    });
    const body = JSON.parse(fetchFn.mock.calls[0][1].body as string);
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("throws with status + detail on a non-OK response", async () => {
    mockFetch(() => ({
      ok: false,
      status: 429,
      text: async () => "rate limited",
    }));
    await expect(
      deepseekChat({ model: "fast", messages: [{ role: "user", content: "x" }] }),
    ).rejects.toThrow(/429/);
  });

  it("returns empty string when the model yields no content", async () => {
    mockFetch(() => ({ ok: true, json: async () => ({ choices: [] }) }));
    expect(
      await deepseekChat({ model: "fast", messages: [{ role: "user", content: "x" }] }),
    ).toBe("");
  });

  it("records usage when meta + a usage payload are present (best-effort)", async () => {
    mockFetch(() => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "ok" } }],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 20,
          prompt_cache_hit_tokens: 80,
          prompt_cache_miss_tokens: 20,
        },
      }),
    }));
    // No service role configured in tests, so recordUsage is a no-op — the call
    // must still succeed and return the content.
    const out = await deepseekChat({
      model: "fast",
      messages: [{ role: "user", content: "x" }],
      meta: { operation: "section", postId: "p", userId: "u" },
    });
    expect(out).toBe("ok");
  });

  it("sends the configured model ID for the alias, not the alias itself", async () => {
    const fetchFn = mockFetch(() => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "ok" } }] }),
    }));
    await deepseekChat({
      model: "reasoner",
      messages: [{ role: "user", content: "x" }],
    });
    const body = JSON.parse(fetchFn.mock.calls[0][1].body as string);
    expect(body.model).toBe("deepseek-reasoner");
  });
});
