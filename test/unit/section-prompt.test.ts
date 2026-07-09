import { describe, it, expect } from "vitest";
import { sectionPhotoLines } from "@/lib/ai/section-prompt";

describe("sectionPhotoLines", () => {
  it("includes the tag, place, shown caption and a trimmed description", () => {
    const out = sectionPhotoLines([
      { id: "p1", place_name: "Bruno Weber Park", ai_description: "Eine Kirche im Abendlicht.", caption: "Abendlicht über der Kirche" },
    ]);
    expect(out).toContain("[photo:p1]");
    expect(out).toContain("Bruno Weber Park");
    expect(out).toContain("Abendlicht über der Kirche");
    expect(out).toMatch(/Bildunterschrift/i);
  });

  it("omits the caption clause when there is no caption yet", () => {
    const out = sectionPhotoLines([
      { id: "p2", place_name: null, ai_description: "Ein See.", caption: null },
    ]);
    expect(out).toContain("[photo:p2]");
    expect(out).not.toMatch(/Bildunterschrift/i);
  });
});
