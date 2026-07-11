import { describe, it, expect } from "vitest";
import { appendTranscript, collectTranscript } from "@/lib/use-dictation";

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

describe("collectTranscript", () => {
  it("emits new finals and returns the interim + high-water mark", () => {
    const r = collectTranscript(
      [
        { transcript: "Heute", isFinal: true },
        { transcript: "am Hafen", isFinal: false },
      ],
      0,
    );
    expect(r.finals).toEqual(["Heute"]);
    expect(r.interim).toBe("am Hafen");
    expect(r.emitted).toBe(1);
  });

  it("never re-emits a final already counted (the duplication bug)", () => {
    const results = [
      { transcript: "Heute", isFinal: true },
      { transcript: "waren wir", isFinal: true },
      { transcript: "am", isFinal: false },
    ];
    // First event commits both finals.
    const first = collectTranscript(results, 0);
    expect(first.finals).toEqual(["Heute", "waren wir"]);
    expect(first.emitted).toBe(2);
    // A later event re-delivers the SAME cumulative results — must not re-emit.
    const second = collectTranscript(results, first.emitted);
    expect(second.finals).toEqual([]);
    expect(second.interim).toBe("am");
    expect(second.emitted).toBe(2);
  });
});
