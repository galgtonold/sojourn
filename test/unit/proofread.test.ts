import { describe, expect, it } from "vitest";
import { applyFinding, buildContext, validateFindings } from "@/lib/ai/proofread";

describe("applyFinding", () => {
  it("replaces the first literal occurrence", () => {
    expect(applyFinding("teh cat and teh dog", "teh", "the")).toBe(
      "the cat and teh dog",
    );
  });
  it("returns null when the original is absent", () => {
    expect(applyFinding("all good here", "teh", "the")).toBeNull();
  });
  it("treats the needle literally (no regex)", () => {
    expect(applyFinding("cost is 5$ today", "5$", "5 EUR")).toBe(
      "cost is 5 EUR today",
    );
  });
});

describe("buildContext", () => {
  it("returns the surrounding text when nothing is truncated", () => {
    expect(buildContext("The quick brwon fox jumps", 10, 5)).toEqual({
      before: "The quick ",
      after: " fox jumps",
    });
  });

  it("elides [[KEEP-n]] placeholders and collapses whitespace", () => {
    // "Start [[KEEP-0]] mid Fehlar end" — "Fehlar" begins at index 21.
    const hay = "Start [[KEEP-0]] mid Fehlar end";
    expect(buildContext(hay, hay.indexOf("Fehlar"), 6).before).toBe("Start mid ");
  });

  it("marks a truncated edge with an ellipsis and snaps to whole words", () => {
    const lead = "alpha bravo charlie delta echo foxtrot golf hotel india ";
    const hay = `${lead}TARGET and the rest of a much longer sentence follows on`;
    const { before, after } = buildContext(hay, lead.length, "TARGET".length);
    expect(before.startsWith("… ")).toBe(true);
    expect(before).not.toContain("alpha"); // partial/early words dropped
    expect(after.endsWith(" …")).toBe(true);
  });
});

describe("validateFindings", () => {
  // Units, not a fixed field map: a finding has to be able to say WHICH caption
  // it belongs to, which the old title|excerpt|body union could not express.
  const units = [
    { key: "title", text: "Erster Tag in Kopenhagen" },
    { key: "excerpt", text: "Ein kurzer Ausflug" },
    { key: "body", text: "Wir kamen bei Regen an. [[KEEP-0]] Es war schoen." },
    { key: "caption:p1", text: "Blick vom Turm", ordinal: 1 },
    { key: "caption:p2", text: "Das Boot im Hafen bei Sonnenuntergnag", ordinal: 4 },
  ];

  it("keeps well-formed findings whose original is present, assigns ids", () => {
    const out = validateFindings(
      {
        findings: [
          { key: "body", type: "spelling", original: "schoen", suggestion: "schön", explanation: "ö" },
          { key: "excerpt", type: "grammar", original: "kurzer", suggestion: "kurze", explanation: "x" },
        ],
      },
      units,
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: "f0", key: "body", original: "schoen" });
    expect(out[1].id).toBe("f1");
  });

  it("resolves a caption finding and carries its position for labelling", () => {
    const out = validateFindings(
      {
        findings: [
          {
            key: "caption:p2",
            type: "spelling",
            original: "Sonnenuntergnag",
            suggestion: "Sonnenuntergang",
            explanation: "Dreher",
          },
        ],
      },
      units,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ key: "caption:p2", ordinal: 4 });
    // Context comes from that caption, not from the body.
    expect(out[0].before).toContain("Boot");
  });

  it("matches `original` within its own unit, not any other", () => {
    // "Blick vom Turm" is caption:p1's text. Claimed against p2 it must not
    // resolve — otherwise a fix would be written to the wrong photo.
    const out = validateFindings(
      {
        findings: [
          { key: "caption:p2", type: "wordchoice", original: "Blick", suggestion: "Ausblick", explanation: "" },
        ],
      },
      units,
    );
    expect(out).toEqual([]);
  });

  it("drops findings that are malformed, unchanged, sentinel-bearing, or absent", () => {
    const out = validateFindings(
      {
        findings: [
          { key: "nope", type: "spelling", original: "x", suggestion: "y", explanation: "" },
          { key: "caption:unknown", type: "spelling", original: "Blick", suggestion: "z", explanation: "" },
          { key: "body", type: "spelling", original: "same", suggestion: "same", explanation: "" },
          { key: "body", type: "spelling", original: "[[KEEP-0]]", suggestion: "photo", explanation: "" },
          { key: "body", type: "spelling", original: "notpresent", suggestion: "z", explanation: "" },
          { key: "title", type: "bogus", original: "Erster", suggestion: "Erste", explanation: "" },
        ],
      },
      units,
    );
    expect(out).toEqual([]);
  });

  it("returns [] for non-array / missing findings", () => {
    expect(validateFindings({}, units)).toEqual([]);
    expect(validateFindings(null, units)).toEqual([]);
  });
});
