import { describe, it, expect } from "vitest";
import { resolveSlug, slugify } from "@/lib/slug";

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
  it("does not leave a trailing hyphen when the cap lands mid-word", () => {
    // "wort " × 20 is 100 chars, so the 80-char cut falls on a separator.
    expect(slugify("wort ".repeat(20))).not.toMatch(/-$/);
  });
  it("returns empty string for punctuation-only input", () => {
    expect(slugify("!!!")).toBe("");
  });
});

describe("resolveSlug", () => {
  it("keeps the slug the author chose", () => {
    expect(resolveSlug("mein-eigener-slug", "Ein ganz anderer Titel")).toBe(
      "mein-eigener-slug",
    );
  });

  it("derives from the title when none was chosen", () => {
    expect(resolveSlug("", "Tromsø im Winter")).toBe("tromso-im-winter");
    expect(resolveSlug(null, "Tromsø im Winter")).toBe("tromso-im-winter");
    expect(resolveSlug(undefined, "Tromsø im Winter")).toBe("tromso-im-winter");
  });

  it("re-derives over a slug this API minted", () => {
    // The editor sends "" for these, but a direct API caller may echo one back.
    expect(resolveSlug("entwurf-a1b2c3d4", "Å, am Ende der Straße")).toBe(
      "a-am-ende-der-strasse",
    );
    expect(resolveSlug("reise-a1b2c3d4", "Lofoten im Winterlicht")).toBe(
      "lofoten-im-winterlicht",
    );
  });

  it("never returns empty while a fallback remains — the not-null unique bug", () => {
    // A title with nothing transliterable. Before the fallback existed, the
    // trips routes wrote "" here: a dead /trips/ URL, then a duplicate-key 500
    // on the very next trip in the same state.
    expect(resolveSlug("", "!!!", "reise-a1b2c3d4")).toBe("reise-a1b2c3d4");
    expect(resolveSlug("", "", "already-saved-slug", "row-id")).toBe(
      "already-saved-slug",
    );
  });

  it("walks the fallbacks in order, skipping empty ones", () => {
    expect(resolveSlug("", "!!!", "", null, undefined, "row-id")).toBe("row-id");
  });

  it("returns empty only when nothing at all is left", () => {
    expect(resolveSlug("", "!!!")).toBe("");
  });
});

describe("slugify: letters NFKD cannot decompose", () => {
  // The bug this replaced: NFKD only decomposes letters Unicode defines a
  // decomposition for. Stroked and ligature letters have none, so they fell
  // through to the [^a-z0-9] bucket and became hyphens — losing exactly the
  // alphabet a travel journal needs.
  it.each([
    ["Å, am Ende der Straße", "a-am-ende-der-strasse"],
    ["Tromsø im Winter", "tromso-im-winter"],
    ["Ærøskøbing", "aeroskobing"],
    ["Þingvellir", "thingvellir"],
    ["Đà Nẵng", "da-nang"],
    ["Łódź", "lodz"],
    ["Ħal Saflieni", "hal-saflieni"],
    ["Œuvre", "oeuvre"],
  ])("%s -> %s", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it("handles the capital sharp s, which only maps in lowercase form", () => {
    // ẞ (U+1E9E) has no entry in the transliteration table; ß does. Without the
    // per-character lowercase rescue in @/lib/slug this yields "strae".
    expect(slugify("STRAẞE")).toBe("strasse");
    expect(slugify("Straße")).toBe("strasse");
  });
});

describe("slugify: non-Latin scripts", () => {
  it.each([
    ["北海道", "bei-hai-dao"],
    ["Θεσσαλονίκη", "thessaloniki"],
    ["Тромсё", "tromsyo"],
    ["Hokkaidō am Polarkreis", "hokkaido-am-polarkreis"],
    ["Kraków und Košice", "krakow-und-kosice"],
  ])("%s -> %s", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });
});

/**
 * The guarantee, rather than the hope.
 *
 * A hand-written replacement map is always missing something and nobody finds
 * out until a title lands on the gap. This sweeps every letter in every Latin
 * block and asserts it survives, so a regression — a dependency bump that drops
 * a mapping, or a change to the pipeline order — fails here instead of silently
 * mangling somebody's URL.
 *
 * The blocks holding living written languages must be perfect. The rest carry
 * IPA, medieval scribal abbreviations and Americanist/Uralic phonetic notation,
 * where plenty of characters genuinely have no ASCII equivalent; those are
 * bounded by a ratio rather than required to be complete, and an empty result
 * is caught by the callers' placeholder fallback either way.
 */
describe("slugify: Latin coverage sweep", () => {
  const lettersIn = (lo: number, hi: number) => {
    const out: { cp: number; ch: string }[] = [];
    for (let cp = lo; cp <= hi; cp++) {
      const ch = String.fromCodePoint(cp);
      if (/\p{Letter}/u.test(ch)) out.push({ cp, ch });
    }
    return out;
  };
  const dropped = (lo: number, hi: number) =>
    lettersIn(lo, hi).filter(({ ch }) => !/^[a-z0-9]+$/.test(slugify(ch)));
  const name = (cp: number) => `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;

  // Every alphabet in general use across Europe and Turkey lives here.
  it.each([
    ["Latin-1 Supplement", 0x00c0, 0x00ff],
    ["Latin Extended-A", 0x0100, 0x017f],
    ["Alphabetic Presentation Forms (ﬀ–ﬆ)", 0xfb00, 0xfb06],
  ] as const)("%s: every letter survives", (_label, lo, hi) => {
    const gaps = dropped(lo, hi).map(({ cp, ch }) => `${name(cp)} ${ch}`);
    expect(gaps).toEqual([]);
  });

  // Vietnamese occupies almost all of Latin Extended Additional and must be
  // complete; the handful of gaps are medieval Latin and Middle Welsh at the
  // very end of the block. ẞ (U+1E9E) sits in this range and is deliberately
  // NOT among them — see the capital-sharp-s test above.
  it("Latin Extended Additional: only medieval letters drop", () => {
    const gaps = dropped(0x1e00, 0x1eff).map(({ cp }) => name(cp));
    expect(gaps).toEqual([
      "U+1E9C", // ẜ  long s with diagonal stroke
      "U+1E9D", // ẝ  long s with high stroke
      "U+1E9F", // ẟ  delta
      "U+1EFA", // Ỻ  Middle Welsh LL
      "U+1EFB", // ỻ
      "U+1EFC", // Ỽ  Middle Welsh V
      "U+1EFD", // ỽ
      "U+1EFE", // Ỿ  Middle Welsh Y
      "U+1EFF", // ỿ
    ]);
  });

  it("covers all of Vietnamese (U+1EA0–U+1EF9)", () => {
    expect(dropped(0x1ea0, 0x1ef9)).toEqual([]);
  });

  // Latin Extended-B mixes real alphabets (Vietnamese Đ, African orthographies)
  // with click consonants and glottal stops that have no ASCII equivalent.
  it("Latin Extended-B: only the unmappable few drop", () => {
    const gaps = dropped(0x0180, 0x024f).map(({ cp }) => name(cp));
    expect(gaps).toEqual([
      "U+018F", // Ə  schwa (Azerbaijani)
      "U+01C0", // ǀ  dental click
      "U+01C1", // ǁ  lateral click
      "U+01C2", // ǂ  alveolar click
      "U+01C3", // ǃ  retroflex click
      "U+01DD", // ǝ  turned e
      "U+0241", // Ɂ  glottal stop
      "U+0242", // ɂ  glottal stop, small
    ]);
  });

  // Phonetic and scribal notation. Not alphabets — bounded, not required whole.
  it.each([
    ["IPA Extensions", 0x0250, 0x02af, 0.2],
    ["Latin Extended-C", 0x2c60, 0x2c7f, 0.8],
    ["Latin Extended-D", 0xa720, 0xa7ff, 0.4],
  ] as const)("%s: stays within its known gap", (_label, lo, hi, maxRatio) => {
    const total = lettersIn(lo, hi).length;
    expect(dropped(lo, hi).length / total).toBeLessThanOrEqual(maxRatio);
  });
});
