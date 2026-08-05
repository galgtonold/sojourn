import { describe, it, expect } from "vitest";
import { dictionaries, LOCALES } from "@/lib/i18n";

// German is half this dictionary and it is full of umlauts, so a broken text
// pipeline shows up as gibberish on the page rather than as an error anywhere.
//
// This exists because it happened: a batch of new strings was written through a
// latin-1 round-trip, and every em dash and umlaut in them turned into two or
// three stray bytes. Typecheck passed. Lint passed. The key-parity test passed
// too — every key was present, it was the VALUES that were rubble. It was
// caught by looking at the rendered page, which is not a repeatable safeguard.

/**
 * Characters that essentially only occur when text has been decoded with the
 * wrong encoding: the replacement character, and the C1 control block that
 * UTF-8 bytes land in when they are read as latin-1.
 *
 * Written as escapes on purpose — a test for mangled characters that contains
 * literal mangled characters is one bad copy-paste from asserting nothing.
 */
const CORRUPTION = /[\uFFFD\u0080-\u009F]/;

describe("dictionary text is intact", () => {
  it("has both locales loaded, so the sweep below is testing something", () => {
    // Guard the guard: an empty dictionary would make every check pass.
    for (const locale of LOCALES) {
      expect(Object.keys(dictionaries[locale]).length).toBeGreaterThan(100);
    }
  });

  for (const locale of LOCALES) {
    it(`carries no replacement or stray control characters (${locale})`, () => {
      const broken = Object.entries(dictionaries[locale])
        .filter(([, v]) => typeof v === "string" && CORRUPTION.test(v))
        .map(([k, v]) => `${k}: ${JSON.stringify(v).slice(0, 80)}`);
      expect(
        broken,
        `these ${locale} strings contain characters that only appear when text has been decoded with the wrong encoding`,
      ).toEqual([]);
    });
  }

  it("still spells German umlauts as single characters", () => {
    // The failure mode is a multi-byte character arriving as several wrong
    // ones, so assert on a word that has to contain one.
    const body = dictionaries.de["empty.stories.body"];
    expect(body).toContain("veröffentlicht");
  });

  it("keeps the em dash an em dash", () => {
    expect(dictionaries.en["empty.photos.body"]).toContain("—");
    expect(dictionaries.de["empty.photos.body"]).toContain("—");
  });
});
