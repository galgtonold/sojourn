import { describe, it, expect } from "vitest";
import {
  cn,
  formatDate,
  isPlaceholderSlug,
  optimizedSrc,
  readingTime,
} from "@/lib/utils";

// slugify moved to @/lib/slug — see test/unit/slug.test.ts.

describe("isPlaceholderSlug", () => {
  it("recognises slugs the API minted", () => {
    expect(isPlaceholderSlug("entwurf-a1b2c3d4")).toBe(true);
    expect(isPlaceholderSlug("reise-a1b2c3d4")).toBe(true);
  });
  it("leaves an author's own slug alone", () => {
    expect(isPlaceholderSlug("lofoten-im-winterlicht")).toBe(false);
    // A real title that merely starts with the same word is not a placeholder:
    // the mint always appends a hyphen and a hex suffix.
    expect(isPlaceholderSlug("reisetagebuch")).toBe(false);
  });
  it("treats empty and missing as not-a-placeholder", () => {
    expect(isPlaceholderSlug("")).toBe(false);
    expect(isPlaceholderSlug(null)).toBe(false);
    expect(isPlaceholderSlug(undefined)).toBe(false);
  });
});

describe("formatDate", () => {
  it("formats an ISO date in the given locale", () => {
    expect(formatDate("2026-05-12", "en")).toBe("12 May 2026");
    expect(formatDate("2026-05-12", "de")).toMatch(/^12\.? Mai 2026$/);
  });
  it("defaults to the app's default locale (de)", () => {
    expect(formatDate("2026-05-12")).toMatch(/Mai 2026$/);
  });
  it("returns empty for null/undefined/invalid", () => {
    expect(formatDate(null)).toBe("");
    expect(formatDate(undefined)).toBe("");
    expect(formatDate("not-a-date")).toBe("");
  });
});

describe("optimizedSrc", () => {
  it("snaps width up to the nearest allowed Next image width", () => {
    expect(optimizedSrc("http://x/a.jpg", 1000)).toContain("w=1080");
  });
  it("caps at the largest allowed width", () => {
    expect(optimizedSrc("http://x/a.jpg", 9999)).toContain("w=3840");
  });
  it("encodes the url and includes quality", () => {
    const s = optimizedSrc("http://x/a b.jpg", 640, 60);
    expect(s).toContain("url=http%3A%2F%2Fx%2Fa%20b.jpg");
    expect(s).toContain("q=60");
    expect(s).toContain("w=640");
  });
});

describe("readingTime", () => {
  it("returns at least 1 minute", () => {
    expect(readingTime(null)).toBe(1);
    expect(readingTime("a few words")).toBe(1);
  });
  it("scales with word count (~220 wpm)", () => {
    expect(readingTime("word ".repeat(440))).toBe(2);
  });
});

describe("cn", () => {
  it("joins truthy classes and drops falsy ones", () => {
    expect(cn("a", false && "b", undefined, "c")).toBe("a c");
  });
  it("merges conflicting tailwind utilities (last wins)", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});
