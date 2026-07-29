import { describe, it, expect } from "vitest";
import { shareImage } from "@/lib/utils";

// An og:image has two silent failure modes, and both look fine from the page
// itself: a relative URL (every scraper discards it, the card just has no
// picture) and a full-size original (the card renders, eventually, after the
// unfurler has pulled several MB of camera JPEG).

const COVER =
  "https://abc123.supabase.co/storage/v1/object/public/photos/demo/reine.jpg";

describe("shareImage", () => {
  it("is absolute, because a relative og:image is silently dropped", () => {
    const url = shareImage(COVER, "https://example.com");
    expect(url.startsWith("https://example.com/")).toBe(true);
  });

  it("resizes to what the platforms actually display", () => {
    expect(shareImage(COVER, "https://example.com")).toContain("w=1200");
  });

  it("keeps the original reachable through the optimizer", () => {
    const url = shareImage(COVER, "https://example.com");
    expect(decodeURIComponent(new URL(url).searchParams.get("url") ?? "")).toBe(
      COVER,
    );
  });

  it("does not double the slash when the site URL has a trailing one", () => {
    const url = shareImage(COVER, "https://example.com/");
    expect(url).not.toContain("com//");
    expect(url.startsWith("https://example.com/_next/image")).toBe(true);
  });

  it("survives a site URL on a port, as a self-hoster's might be", () => {
    const url = shareImage(COVER, "http://localhost:3000");
    expect(url.startsWith("http://localhost:3000/_next/image")).toBe(true);
  });
});
