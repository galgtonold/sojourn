import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Why this test exists: `enqueueLlmJob` INSERTs into `ai_jobs.model`, and the
// Supabase Edge Function (supabase/functions/llm-call/index.ts) later reads
// that column and posts it to the provider VERBATIM — there's no alias
// resolution on the Deno side. So if `enqueueLlmJob` ever regresses to
// inserting the raw alias ("fast"/"reasoner") instead of the resolved model
// ID, every edge-backed generation breaks in production: the provider
// receives "fast" as a model name. `getAdminSupabase()` returns an untyped
// client, so that regression still typechecks, and every other test forces
// `isEdgeJobConfigured: false` so the insert-then-enqueue path never runs —
// nothing else would catch it. This test forces the edge path on and asserts
// the inserted row carries the resolved ID, for both the "fast" and
// "reasoner" aliases (so a resolver that always returned the fast model
// would still fail).

const captured = vi.hoisted(() => ({ model: undefined as string | undefined }));

vi.mock("@/lib/supabase/admin", () => ({
  getAdminSupabase: () => ({
    from: (_table: string) => ({
      insert: (row: Record<string, unknown>) => {
        captured.model = row.model as string;
        return {
          select: () => ({
            single: async () => ({ data: { id: "job-1" }, error: null }),
          }),
        };
      },
      update: () => ({ eq: async () => ({ data: null, error: null }) }),
    }),
  }),
}));

// Force the Edge-job path to actually execute (see src/lib/env.ts —
// isEdgeJobConfigured requires both the shared secret and function URL), so
// the test exercises the same code path production uses instead of the
// synchronous fallback every other test forces.
vi.mock("@/lib/env", async (orig) => {
  const actual = await orig<typeof import("@/lib/env")>();
  return {
    ...actual,
    isEdgeJobConfigured: true,
    env: {
      ...actual.env,
      edgeSharedSecret: "test-secret",
      edgeFunctionUrl: "http://edge.test/functions/v1/llm-call",
    },
  };
});

// getAiConfig is a Next unstable_cache, which needs a request-scoped
// incremental cache a unit test can't supply — mocked to the pure resolver,
// following the established pattern in test/unit/deepseek.test.ts. The model
// IDs are pinned here so the alias -> ID mapping is visible in the assertion.
vi.mock("@/lib/ai-config", async () => {
  const { resolveAiConfig } = await import("@/lib/ai-config-fields");
  return {
    AI_CONFIG_TAG: "ai-config",
    getAiConfig: async () =>
      resolveAiConfig(
        {
          deepseekApiKey: "test-key",
          deepseekModelFast: "deepseek-v4-flash",
          deepseekModelReasoner: "deepseek-v4-pro",
        },
        {},
      ),
  };
});

import { enqueueLlmJob } from "@/lib/ai/jobs";

describe("enqueueLlmJob", () => {
  beforeEach(() => {
    captured.model = undefined;
    // Edge dispatch succeeds so the function returns right after the insert,
    // without falling through to the synchronous deepseekChat fallback.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200 })),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("inserts the resolved model ID for the 'fast' alias, not the alias", async () => {
    await enqueueLlmJob({
      model: "fast",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(captured.model).toBe("deepseek-v4-flash");
  });

  it("inserts the resolved model ID for the 'reasoner' alias, not the alias", async () => {
    await enqueueLlmJob({
      model: "reasoner",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(captured.model).toBe("deepseek-v4-pro");
  });
});
