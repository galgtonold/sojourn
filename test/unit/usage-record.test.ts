import { describe, it, expect, vi } from "vitest";
import { makeFakeSupabase } from "../helpers/fake-supabase";

const admin = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminSupabase: () => admin.client }));

import { recordUsage } from "@/lib/ai/usage";

const usage = {
  prompt_tokens: 1000,
  completion_tokens: 500,
  cache_hit_tokens: 800,
  cache_miss_tokens: 200,
};

describe("recordUsage", () => {
  it("is a no-op (no throw) when the service role is unconfigured", async () => {
    admin.client = null;
    await expect(
      recordUsage({ operation: "section", model: "m", usage }),
    ).resolves.toBeUndefined();
  });

  it("inserts a row with the estimated cost when configured", async () => {
    const fake = makeFakeSupabase({ ai_usage: [] });
    admin.client = fake;
    await recordUsage({
      operation: "section",
      model: "deepseek-reasoner",
      usage,
      postId: "p1",
      userId: "u1",
    });
    const rows = fake.store.ai_usage;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      operation: "section",
      model: "deepseek-reasoner",
      post_id: "p1",
      user_id: "u1",
      completion_tokens: 500,
      cache_hit_tokens: 800,
      cache_miss_tokens: 200,
    });
    expect(rows[0].cost_usd).toBeGreaterThan(0);
  });
});
