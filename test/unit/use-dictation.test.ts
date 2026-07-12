import { describe, it, expect } from "vitest";
import { appendTranscript, growthFrom } from "@/lib/use-dictation";

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

describe("growthFrom", () => {
  it("separates finalized text (delta) from interim", () => {
    const r = growthFrom(
      [
        { transcript: "okay ", isFinal: true },
        { transcript: "noch mal", isFinal: false },
      ],
      "",
    );
    expect(r.delta).toBe("okay ");
    expect(r.finalText).toBe("okay ");
    expect(r.interim).toBe("noch mal");
  });

  it("emits only the growth beyond what was already emitted", () => {
    const r = growthFrom(
      [{ transcript: "okay noch mal einen Test", isFinal: true }],
      "okay noch mal",
    );
    expect(r.delta).toBe(" einen Test");
  });

  // The "beginning doubles" bug: the results list re-sends the already-finalized
  // first chunk on every event. growthFrom must NOT re-emit it.
  it("does not re-emit an already-finalized chunk that keeps being re-sent", () => {
    const results = [
      { transcript: "okay noch mal", isFinal: true },
      { transcript: "einen", isFinal: false }, // interim, still being spoken
    ];
    // We already emitted the first final; a later event re-sends it unchanged.
    const r = growthFrom(results, "okay noch mal");
    expect(r.delta).toBe("");
    expect(r.interim).toBe("einen");
  });

  it("emits the next finalized chunk once it stabilizes, still no re-emit of the first", () => {
    const results = [
      { transcript: "okay noch mal", isFinal: true },
      { transcript: " einen Test", isFinal: true },
    ];
    const r = growthFrom(results, "okay noch mal");
    expect(r.delta).toBe(" einen Test");
    expect(r.finalText).toBe("okay noch mal einen Test");
  });

  it("emits nothing when the finalized text is unchanged", () => {
    const r = growthFrom(
      [{ transcript: "okay noch mal", isFinal: true }],
      "okay noch mal",
    );
    expect(r.delta).toBe("");
  });
});
