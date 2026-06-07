import { describe, it, expect } from "vitest";
import {
  translate,
  normalizeLocale,
  dictionaries,
  type DictKey,
} from "@/lib/i18n";

describe("translate", () => {
  it("returns the localized string", () => {
    expect(translate("en", "poll.label")).toBe("Poll");
    expect(translate("de", "poll.label")).toBe("Umfrage");
  });

  it("substitutes {vars}", () => {
    expect(translate("en", "interaction.responses", { n: 5 })).toBe("5 responses");
    expect(translate("de", "interaction.responses", { n: 5 })).toBe("5 Antworten");
  });

  it("falls back to the key itself for an unknown key", () => {
    expect(translate("de", "totally.missing.key" as DictKey)).toBe(
      "totally.missing.key",
    );
  });
});

describe("normalizeLocale", () => {
  it("passes through supported locales", () => {
    expect(normalizeLocale("en")).toBe("en");
    expect(normalizeLocale("de")).toBe("de");
  });
  it("defaults to de for anything else", () => {
    expect(normalizeLocale("fr")).toBe("de");
    expect(normalizeLocale(undefined)).toBe("de");
    expect(normalizeLocale(null)).toBe("de");
  });
});

describe("dictionaries", () => {
  it("define the same set of keys for de and en", () => {
    const en = Object.keys(dictionaries.en).sort();
    const de = Object.keys(dictionaries.de).sort();
    expect(de).toEqual(en);
  });
});
