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

// The failure this replaced was total and silent: a browser revises a chunk it
// had already finalized — re-punctuating it, or changing its capitalisation —
// and the old "must start with what we emitted" rule was false from then on. The
// position never advanced, no further word was ever emitted, and the microphone
// carried on pulsing as though it were working.
describe("growthFrom when the browser revises text it already finalized", () => {
  it("keeps going instead of freezing", () => {
    // "Hallo Welt" was emitted; the browser now says "hallo Welt. Und weiter".
    const revised = growthFrom(
      [{ transcript: "hallo Welt. Und weiter", isFinal: true }],
      "Hallo Welt",
    );
    expect(revised.delta).not.toBe("");
    expect(revised.finalText).toBe("hallo Welt. Und weiter");
  });

  it("emits only from the point the two actually diverge", () => {
    const { delta } = growthFrom(
      [{ transcript: "Hallo Welt und weiter", isFinal: true }],
      "Hallo Welt",
    );
    expect(delta).toBe(" und weiter");
  });

  it("still emits nothing when the finalized text is identical", () => {
    // The ordinary case must not regress: re-sent finals stay silent.
    const { delta } = growthFrom(
      [{ transcript: "Hallo Welt", isFinal: true }],
      "Hallo Welt",
    );
    expect(delta).toBe("");
  });

  it("recovers on the very next event, not several later", () => {
    // Walk a session: two clean chunks, one revision, one more chunk.
    let emitted = "";
    const emit = (finals: string[]) => {
      const r = growthFrom(
        finals.map((t) => ({ transcript: t, isFinal: true })),
        emitted,
      );
      emitted = r.finalText;
      return r.delta;
    };
    expect(emit(["Der Weg"])).toBe("Der Weg");
    expect(emit(["Der Weg", " war schmal"])).toBe(" war schmal");
    // Revision: the browser lowercases the opening.
    expect(emit(["der Weg war schmal"])).toBe("der Weg war schmal");
    // And the session continues normally from the corrected text.
    expect(emit(["der Weg war schmal", " und steil"])).toBe(" und steil");
  });
});
