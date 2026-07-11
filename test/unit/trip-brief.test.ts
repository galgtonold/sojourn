import { describe, it, expect } from "vitest";
import { selectPriorDays, stripBody, briefInput } from "@/lib/ai/trip-brief";

const day = (title: string, published_at: string | null) => ({
  title,
  body: `body of ${title}`,
  published_at,
});

describe("selectPriorDays", () => {
  it("returns days before this one, sorted ascending", () => {
    const out = selectPriorDays(
      [day("Day3", "2024-05-03T12:00:00Z"), day("Day1", "2024-05-01T12:00:00Z")],
      "2024-05-04T12:00:00Z",
    );
    expect(out.map((d) => d.title)).toEqual(["Day1", "Day3"]);
  });

  it("excludes days on/after the current date", () => {
    const out = selectPriorDays(
      [day("Day1", "2024-05-01T12:00:00Z"), day("Day5", "2024-05-05T12:00:00Z")],
      "2024-05-03T12:00:00Z",
    );
    expect(out.map((d) => d.title)).toEqual(["Day1"]);
  });

  it("treats all dated siblings as prior when this post has no date yet", () => {
    const out = selectPriorDays(
      [day("Day2", "2024-05-02T12:00:00Z"), day("Day1", "2024-05-01T12:00:00Z")],
      null,
    );
    expect(out.map((d) => d.title)).toEqual(["Day1", "Day2"]);
  });

  it("drops siblings without a parseable date", () => {
    const out = selectPriorDays(
      [day("Dated", "2024-05-01T12:00:00Z"), day("Undated", null)],
      "2024-05-03T12:00:00Z",
    );
    expect(out.map((d) => d.title)).toEqual(["Dated"]);
  });
});

describe("stripBody / briefInput", () => {
  it("stripBody removes tokens + directive fences and collapses whitespace", () => {
    expect(stripBody("A [photo:x] B\n\n:::poll\nq\n:::\nC")).toBe("A B C");
  });

  it("briefInput builds per-day headers and prepends trip context", () => {
    const out = briefInput(
      [{ title: "Ankunft", body: "Wir kamen an. [photo:1]", published_at: "2024-05-01T12:00:00Z" }],
      { summary: "Radtour", ai_context: null },
    );
    expect(out).toContain("Reise-Kontext: Radtour");
    expect(out).toContain("## Ankunft — 2024-05-01");
    expect(out).toContain("Wir kamen an.");
    expect(out).not.toContain("[photo:1]");
  });
});
