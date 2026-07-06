import { describe, expect, it } from "vitest";
import { applyFinding, validateFindings } from "@/lib/ai/proofread";

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
