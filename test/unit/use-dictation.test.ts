import { describe, it, expect } from "vitest";
import { appendTranscript, collectFrom } from "@/lib/use-dictation";

describe("appendTranscript", () => {
  it("joins with a single space", () => {
    expect(appendTranscript("Heute waren wir", "am Hafen")).toBe("Heute waren wir am Hafen");
  });
  it("returns the chunk when existing is empty", () => {
    expect(appendTranscript("", "Los geht's")).toBe("Los geht's");
  });
  it("does not double the space when existing already ends in whitespace", () => {
    expect(appendTranscript("Heute waren wir ", "am Hafen")).toBe("Heute waren wir am Hafen");
  });
  it("ignores a blank chunk", () => {
    expect(appendTranscript("Heute", "   ")).toBe("Heute");
  });
});

describe("collectFrom", () => {
  it("returns the new finals to append and the interim separately", () => {
    const r = collectFrom(
      [
        { transcript: "okay ", isFinal: true },
        { transcript: "noch mal", isFinal: false },
      ],
      0,
    );
    expect(r.finals).toBe("okay ");
    expect(r.interim).toBe("noch mal");
  });

  it("emits only the newly finalized chunk (from resultIndex), not earlier ones", () => {
    const results = [
      { transcript: "okay ", isFinal: true },
      { transcript: "noch mal einen Test", isFinal: true },
    ];
    // resultIndex 1: index 0 was already reported in a prior event — only the
    // second, new final is emitted now.
    const r = collectFrom(results, 1);
    expect(r.finals).toBe("noch mal einen Test");
    expect(r.interim).toBe("");
  });

  // The doubling regression: a later event re-includes an already-finalized
  // result in `results`, but `resultIndex` points past it — so it is NOT
  // re-appended. This is what trusting resultIndex (rather than a hand-rolled
  // counter) guarantees.
  it("does not re-emit a finalized result that a later event still carries", () => {
    const results = [
      { transcript: "okay noch mal einen Test mit dem Mikrofon", isFinal: true },
      { transcript: "und", isFinal: false },
    ];
    const r = collectFrom(results, 1);
    expect(r.finals).toBe("");
    expect(r.interim).toBe("und");
  });

  it("collects several new finals in one event", () => {
    const r = collectFrom(
      [
        { transcript: "a", isFinal: true },
        { transcript: "b", isFinal: true },
      ],
      0,
    );
    expect(r.finals).toBe("ab");
    expect(r.interim).toBe("");
  });

  it("clamps a negative/odd resultIndex to 0", () => {
    const r = collectFrom([{ transcript: "hallo", isFinal: true }], -1);
    expect(r.finals).toBe("hallo");
  });
});
