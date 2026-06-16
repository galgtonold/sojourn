import { describe, it, expect } from "vitest";
import {
  cn,
  slugify,
  formatDate,
  optimizedSrc,
  readingTime,
} from "@/lib/utils";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Hello, World!")).toBe("hello-world");
  });
  it("strips diacritics", () => {
    expect(slugify("Über die Pässe")).toBe("uber-die-passe");
  });
  it("trims leading/trailing separators", () => {
    expect(slugify("  --Hi there--  ")).toBe("hi-there");
  });
  it("caps length at 80 chars", () => {
    expect(slugify("a".repeat(200)).length).toBeLessThanOrEqual(80);
  });
  it("returns empty string for punctuation-only input", () => {
    expect(slugify("!!!")).toBe("");
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
