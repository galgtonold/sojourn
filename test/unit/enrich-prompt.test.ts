import { describe, it, expect } from "vitest";
import { visionUserText } from "@/lib/ai/enrich";

describe("visionUserText", () => {
  it("frames the place as camera-location, not the subject", () => {
    const text = visionUserText("Bruno Weber Park", []);
    expect(text).toContain("Kamera-Standort");
    expect(text).toContain("Bruno Weber Park");
    expect(text).toMatch(/nicht zwingend das Motiv/i);
  });

  it("lists other nearby candidates and tells the model not to guess", () => {
    const text = visionUserText("Bruno Weber Park", [
      "Bruno Weber Park",
      "Reformierte Kirche Dietikon",
    ]);
    expect(text).toContain("Reformierte Kirche Dietikon");
    expect(text).not.toMatch(/In der Nähe.*Bruno Weber Park/s); // the place isn't re-listed
    expect(text).toMatch(/rate NICHT/i);
  });

  it("still asks for a full description when there is no place", () => {
    const text = visionUserText(null, []);
    expect(text).toContain("Beschreibe dieses Reisefoto");
  });
});
