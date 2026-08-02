import { describe, it, expect } from "vitest";
import {
  ANALYTICS_PROVIDERS,
  resolveAnalytics,
  isAnalyticsProvider,
} from "@/lib/telemetry-fields";

// Precedence mirrors the AI config's rule — DB → env → off — so an owner who
// sets this in /admin/settings overrides the deployment's variable, and an
// install that has never opened settings keeps whatever its env said.

describe("resolveAnalytics", () => {
  it("prefers what the owner chose in the admin UI", () => {
    expect(resolveAnalytics("vercel", "")).toBe("vercel");
    expect(resolveAnalytics("none", "vercel")).toBe("none");
  });

  it("falls back to the environment when the setting is untouched", () => {
    expect(resolveAnalytics("", "vercel")).toBe("vercel");
    expect(resolveAnalytics(null, "vercel")).toBe("vercel");
    expect(resolveAnalytics(undefined, "vercel")).toBe("vercel");
  });

  it("is off when neither says anything — the default for a fresh install", () => {
    expect(resolveAnalytics("", "")).toBe("none");
    expect(resolveAnalytics(null, undefined)).toBe("none");
  });

  it("ignores whitespace rather than treating it as a choice", () => {
    expect(resolveAnalytics("   ", "vercel")).toBe("vercel");
  });

  it("refuses a value it doesn't recognise, from either source", () => {
    // A typo in the env or a stale row must not silently load nothing-knows-what.
    expect(resolveAnalytics("plausible", "")).toBe("none");
    expect(resolveAnalytics("", "google-analytics")).toBe("none");
  });

  it("treats an explicit 'none' as a real choice, not as unset", () => {
    // This is what lets an owner turn OFF analytics their env var turned on,
    // without editing the deployment.
    expect(resolveAnalytics("none", "vercel")).toBe("none");
  });
});

describe("isAnalyticsProvider", () => {
  it("accepts exactly the providers the UI offers", () => {
    for (const p of ANALYTICS_PROVIDERS) expect(isAnalyticsProvider(p)).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isAnalyticsProvider("plausible")).toBe(false);
    expect(isAnalyticsProvider("")).toBe(false);
  });
});
