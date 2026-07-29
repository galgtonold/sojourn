import { describe, it, expect } from "vitest";
import { pickSupabaseKey, pickServiceKey } from "@/lib/env-aliases";

// Sojourn's own names and the ones Vercel's Supabase Marketplace integration
// writes are different. Accepting both is what makes a one-click deploy work
// without the operator hand-copying anything:
//
//   ours                            integration's
//   NEXT_PUBLIC_SUPABASE_ANON_KEY   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
//   SUPABASE_SERVICE_ROLE_KEY       SUPABASE_SECRET_KEY

describe("pickSupabaseKey", () => {
  it("prefers our own name when it is set", () => {
    expect(
      pickSupabaseKey({
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "ours",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "theirs",
      }),
    ).toBe("ours");
  });

  it("accepts the integration's publishable key", () => {
    expect(
      pickSupabaseKey({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x" }),
    ).toBe("sb_publishable_x");
  });

  it("is empty when neither is set, so the app still fails loudly", () => {
    expect(pickSupabaseKey({})).toBe("");
  });

  it("ignores a blank value rather than treating it as configured", () => {
    expect(
      pickSupabaseKey({
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "   ",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
      }),
    ).toBe("sb_publishable_x");
  });
});

describe("pickServiceKey", () => {
  it("prefers our own name when it is set", () => {
    expect(
      pickServiceKey({
        SUPABASE_SERVICE_ROLE_KEY: "ours",
        SUPABASE_SECRET_KEY: "theirs",
      }),
    ).toBe("ours");
  });

  it("accepts the integration's secret key", () => {
    expect(pickServiceKey({ SUPABASE_SECRET_KEY: "sb_secret_x" })).toBe(
      "sb_secret_x",
    );
  });

  it("is empty when neither is set, so admin features stay switched off", () => {
    expect(pickServiceKey({})).toBe("");
  });

  it("ignores a blank value", () => {
    expect(
      pickServiceKey({ SUPABASE_SERVICE_ROLE_KEY: "", SUPABASE_SECRET_KEY: "sb_secret_x" }),
    ).toBe("sb_secret_x");
  });
});
