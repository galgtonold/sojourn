import { describe, it, expect } from "vitest";
import { localProse } from "@/lib/ai/caption-context";

const body = `## Ankunft

Wir kamen spät an und waren müde.

[photo:p1]

Am Hafen roch es nach Tang.

[photo:p2]

Ende der Reise.`;

describe("localProse", () => {
  it("returns the prose before and after a placed photo, tokens/headings stripped", () => {
    const out = localProse(body, "p1");
    expect(out).toContain("müde"); // before
    expect(out).toContain("Tang"); // after
    expect(out).not.toContain("[photo:");
    expect(out).not.toContain("#");
  });

  it("stops at an adjacent media tag (doesn't pull the next photo's prose)", () => {
    expect(localProse(body, "p1")).not.toContain("Ende");
  });

  it("returns '' when the photo isn't placed inline", () => {
    expect(localProse(body, "missing")).toBe("");
  });

  it("respects the window bound", () => {
    const long = "x ".repeat(500) + "[photo:q]" + " y".repeat(500);
    expect(localProse(long, "q", 50).length).toBeLessThanOrEqual(120);
  });
});
