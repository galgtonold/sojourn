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
  const fields = {
    title: "Erster Tag in Kopenhagen",
    excerpt: "Ein kurzer Ausflug",
    body: "Wir kamen bei Regen an. [[KEEP-0]] Es war schoen.",
  };

  it("keeps well-formed findings whose original is present, assigns ids", () => {
    const out = validateFindings(
      {
        findings: [
          { field: "body", type: "spelling", original: "schoen", suggestion: "schön", explanation: "ö" },
          { field: "excerpt", type: "grammar", original: "kurzer", suggestion: "kurze", explanation: "x" },
        ],
      },
      fields,
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: "f0", field: "body", original: "schoen" });
    expect(out[1].id).toBe("f1");
  });

  it("drops findings that are malformed, unchanged, sentinel-bearing, or absent", () => {
    const out = validateFindings(
      {
        findings: [
          { field: "nope", type: "spelling", original: "x", suggestion: "y", explanation: "" },
          { field: "body", type: "spelling", original: "same", suggestion: "same", explanation: "" },
          { field: "body", type: "spelling", original: "[[KEEP-0]]", suggestion: "photo", explanation: "" },
          { field: "body", type: "spelling", original: "notpresent", suggestion: "z", explanation: "" },
          { field: "title", type: "bogus", original: "Erster", suggestion: "Erste", explanation: "" },
        ],
      },
      fields,
    );
    expect(out).toEqual([]);
  });

  it("returns [] for non-array / missing findings", () => {
    expect(validateFindings({}, fields)).toEqual([]);
    expect(validateFindings(null, fields)).toEqual([]);
  });
});
