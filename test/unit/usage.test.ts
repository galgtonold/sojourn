import { describe, it, expect } from "vitest";
import { estimateCost } from "@/lib/ai/usage";

// Uses the default rates from env.ts (no AI_PRICE_* overrides in the test env):
// cache hit $0.07, cache miss $0.27, output $1.10 — all per 1M tokens.
describe("estimateCost", () => {
  it("prices cache hits, misses and output separately", () => {
    const cost = estimateCost({
      prompt_tokens: 1_000_000,
      completion_tokens: 1_000_000,
      cache_hit_tokens: 1_000_000,
      cache_miss_tokens: 1_000_000,
    });
    // 0.07 + 0.27 + 1.10 (prompt_tokens is not billed directly here).
    expect(cost).toBeCloseTo(1.44, 6);
  });

  it("is zero for an empty usage record", () => {
    expect(
      estimateCost({
        prompt_tokens: 0,
        completion_tokens: 0,
        cache_hit_tokens: 0,
        cache_miss_tokens: 0,
      }),
    ).toBe(0);
  });
});
