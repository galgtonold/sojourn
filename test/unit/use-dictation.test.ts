import { describe, it, expect } from "vitest";
import { growthFrom, insertTranscript } from "@/lib/use-dictation";

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

// Dictation used to append to the very end regardless of where the caret was.
// These pin the spacing a person would have typed, and the caret landing after
// the words rather than before them — the two halves of "I cannot see where it
// went".
describe("insertTranscript", () => {
  it("appends at the end, like it always did", () => {
    const r = insertTranscript("Der Weg war schmal.", "Und steil", 19);
    expect(r.text).toBe("Der Weg war schmal. Und steil");
    expect(r.caret).toBe(r.text.length);
  });

  it("inserts where the caret actually is", () => {
    // Caret after "Der Weg" — the words belong there, not at the end.
    const r = insertTranscript("Der Weg war schmal.", "hinauf", 7);
    expect(r.text).toBe("Der Weg hinauf war schmal.");
  });

  it("leaves the caret after what it inserted", () => {
    const r = insertTranscript("Der Weg war schmal.", "hinauf", 7);
    expect(r.text.slice(0, r.caret)).toBe("Der Weg hinauf");
  });

  it("does not double a space that is already there", () => {
    const r = insertTranscript("Der Weg ", "hinauf", 8);
    expect(r.text).toBe("Der Weg hinauf");
  });

  it("does not put a space before punctuation", () => {
    // Caret sits just before the full stop: "…schmal[.]"
    const r = insertTranscript("Der Weg war schmal.", "und steil", 18);
    expect(r.text).toBe("Der Weg war schmal und steil.");
  });

  it("needs no leading space at the very start", () => {
    const r = insertTranscript("war schmal.", "Der Weg", 0);
    expect(r.text).toBe("Der Weg war schmal.");
  });

  it("ignores a blank chunk and leaves the caret alone", () => {
    const r = insertTranscript("Der Weg", "   ", 3);
    expect(r).toEqual({ text: "Der Weg", caret: 3 });
  });

  it("survives a caret beyond the text, which a stale position can be", () => {
    const r = insertTranscript("kurz", "weiter", 999);
    expect(r.text).toBe("kurz weiter");
    expect(r.caret).toBe(r.text.length);
  });

  it("composes across consecutive chunks the way a session does", () => {
    let text = "";
    let caret = 0;
    for (const chunk of ["Der Weg", "war schmal", "und steil"]) {
      ({ text, caret } = insertTranscript(text, chunk, caret));
    }
    expect(text).toBe("Der Weg war schmal und steil");
    expect(caret).toBe(text.length);
  });
});
