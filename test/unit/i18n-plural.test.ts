import { describe, expect, it } from "vitest";
import { translate } from "@/lib/i18n";

describe("translate — ICU plural selection", () => {
  it("picks the singular form for n === 1 (en + de)", () => {
    expect(translate("en", "archive.subtitle", { n: 1 })).toBe(
      "1 story from the road.",
    );
    expect(translate("de", "archive.subtitle", { n: 1 })).toBe(
      "1 Geschichte von unterwegs.",
    );
  });

  it("picks the plural form for n === 0 and n > 1", () => {
    expect(translate("en", "archive.subtitle", { n: 0 })).toBe(
      "0 stories from the road.",
    );
    expect(translate("en", "archive.subtitle", { n: 5 })).toBe(
      "5 stories from the road.",
    );
    expect(translate("de", "archive.subtitle", { n: 2 })).toBe(
      "2 Geschichten von unterwegs.",
    );
  });

  it("handles German adjective agreement (verortetes vs verortete)", () => {
    expect(translate("de", "trips.photos", { n: 1 })).toBe("1 verortetes Foto");
    expect(translate("de", "trips.photos", { n: 3 })).toBe("3 verortete Fotos");
  });

  it("handles German verb agreement (verweist vs verweisen)", () => {
    expect(translate("de", "admin.ai.warn.photos", { n: 1 })).toContain(
      "1 Abschnitt verweist",
    );
    expect(translate("de", "admin.ai.warn.photos", { n: 4 })).toContain(
      "4 Abschnitte verweisen",
    );
  });

  it("resolves a plural block alongside other placeholders", () => {
    expect(translate("en", "search.results", { n: 1, q: "fjord" })).toBe(
      "1 result for “fjord”",
    );
    expect(translate("en", "search.results", { n: 3, q: "fjord" })).toBe(
      "3 results for “fjord”",
    );
  });

  it("leaves non-plural strings and simple interpolation untouched", () => {
    expect(translate("en", "journey.goToStop", { n: 2 })).toBe("Go to stop 2");
    expect(translate("en", "admin.routes.part", { n: 3 })).toBe("Part 3");
  });
});
