import { describe, it, expect } from "vitest";
import {
  segmentBody,
  mergeFindingPayloads,
  validateFindings,
  SEGMENT_CHARS,
} from "@/lib/ai/proofread";

// The proofreader now sends a post in pieces, because sending it whole started
// failing on every attempt: the model spent the entire token budget reasoning
// and never began the answer (finish_reason "length", 8 for 8 on 2026-08-03,
// against 9 for 9 successes in the month before).
//
// The invariant that makes chunking safe is verbatim reassembly. Findings come
// back naming a substring of a SEGMENT, and are then looked up in the WHOLE
// body. Change a single character — normalise whitespace, trim a segment, drop
// a separator — and every finding silently fails that lookup and is discarded.
// The author sees "no problems found" on a post riddled with them.

const para = (n: number, len = 200) => `Absatz ${n}. ` + "wort ".repeat(len / 5);

describe("segmenting a body", () => {
  it("reassembles to exactly the input", () => {
    const body = [para(1), para(2), para(3, 900), para(4)].join("\n\n");
    expect(segmentBody(body).join("")).toBe(body);
  });

  it("reassembles exactly even with irregular blank lines", () => {
    const body = "Eins.\n\n\n  \n\nZwei.\n\nDrei.";
    expect(segmentBody(body, 10).join("")).toBe(body);
  });

  it("keeps a short body whole — no reason to split", () => {
    const body = "Ein kurzer Absatz.";
    expect(segmentBody(body)).toEqual([body]);
  });

  it("returns nothing for an empty body", () => {
    expect(segmentBody("")).toEqual([]);
    expect(segmentBody("   \n\n  ")).toEqual([]);
  });

  it("actually splits a post the size of the ones that failed", () => {
    // ~6000 chars, the size of forchheim-und-der-walberla-bei-gewitter.
    const body = Array.from({ length: 30 }, (_, i) => para(i)).join("\n\n");
    const segs = segmentBody(body);
    expect(segs.length).toBeGreaterThan(1);
    expect(segs.join("")).toBe(body);
  });

  it("splits an over-long single paragraph rather than emitting it whole", () => {
    // One paragraph, no blank lines to split on — must fall back to sentences.
    const body = Array.from({ length: 60 }, (_, i) => `Satz ${i}.`).join(" ");
    const segs = segmentBody(body, 120);
    expect(segs.length).toBeGreaterThan(1);
    expect(segs.join("")).toBe(body);
  });

  it("never splits mid-word", () => {
    const body = Array.from({ length: 40 }, (_, i) => `Satz ${i}.`).join(" ");
    for (const s of segmentBody(body, 100)) {
      expect(s).not.toMatch(/\w$/); // segments end at punctuation or space
    }
  });

  it("keeps segments near the budget, not wildly over", () => {
    const body = Array.from({ length: 40 }, (_, i) => para(i)).join("\n\n");
    // A single paragraph can exceed the budget; the packing must not compound it.
    for (const s of segmentBody(body)) {
      expect(s.length).toBeLessThanOrEqual(SEGMENT_CHARS * 2);
    }
  });
});

describe("merging what the segments found", () => {
  it("concatenates findings from every payload", () => {
    const merged = mergeFindingPayloads([
      { findings: [{ a: 1 }] },
      { findings: [{ b: 2 }, { c: 3 }] },
    ]);
    expect(merged.findings).toHaveLength(3);
  });

  it("survives a segment that failed or returned nonsense", () => {
    // askOne returns {findings: []} when a call throws; other shapes are the
    // model misbehaving. Neither may take the good segments down with it.
    const merged = mergeFindingPayloads([
      { findings: [{ a: 1 }] },
      null,
      undefined,
      "nope",
      { findings: "not-an-array" },
      { findings: [] },
    ]);
    expect(merged.findings).toHaveLength(1);
  });
});

describe("a finding from one segment, validated against the whole body", () => {
  it("resolves, which is the entire point of verbatim slicing", () => {
    const body = [para(1), "Das ist ein Feler im Text.", para(3)].join("\n\n");
    const segs = segmentBody(body, 300);
    // The typo lives in whichever segment happens to hold it.
    expect(segs.some((s) => s.includes("Feler"))).toBe(true);

    const found = validateFindings(
      { findings: [{ field: "body", type: "spelling", original: "Feler", suggestion: "Fehler", explanation: "Tippfehler" }] },
      { title: "", excerpt: "", body },
    );
    expect(found).toHaveLength(1);
    expect(found[0].suggestion).toBe("Fehler");
  });

  it("still drops a finding the model invented", () => {
    const found = validateFindings(
      { findings: [{ field: "body", type: "spelling", original: "kommt gar nicht vor", suggestion: "x", explanation: "" }] },
      { title: "", excerpt: "", body: "Ein sauberer Satz." },
    );
    expect(found).toEqual([]);
  });
});
