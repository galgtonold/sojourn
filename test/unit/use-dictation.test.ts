import { describe, it, expect } from "vitest";
import {
  applyEnd,
  applyResult,
  faultFrom,
  growthFrom,
  insertTranscript,
  startSession,
} from "@/lib/use-dictation";

// Every one of these ends the session. Only one of them used to say anything,
// so the microphone would go quiet mid-thought and the author was left to guess
// whether they had done something wrong, whether it was still listening, or
// whether the feature simply did not work.
describe("faultFrom — why the microphone stopped", () => {
  it("reports a refused permission", () => {
    expect(faultFrom("not-allowed")).toBe("denied");
    expect(faultFrom("service-not-allowed")).toBe("denied");
  });

  it("reports a missing microphone separately from a refused one", () => {
    // Different fix: one is a browser prompt, the other is hardware.
    expect(faultFrom("audio-capture")).toBe("no-mic");
  });

  it("reports a dropped speech service", () => {
    expect(faultFrom("network")).toBe("network");
  });

  it("reports having heard nothing", () => {
    expect(faultFrom("no-speech")).toBe("no-speech");
  });

  // Chrome raises `no-speech` for a long enough pause, including one at the end
  // of a session that transcribed perfectly well. Telling the author it caught
  // nothing when it had just written a paragraph for them would be a lie, and
  // the sort that makes the honest warnings worthless.
  it("stays quiet about silence in a session that did hear something", () => {
    expect(faultFrom("no-speech", true)).toBeNull();
  });

  it("still reports the other faults even when it heard something first", () => {
    expect(faultFrom("network", true)).toBe("network");
    expect(faultFrom("audio-capture", true)).toBe("no-mic");
  });

  it("reports a language the browser cannot dictate", () => {
    expect(faultFrom("language-not-supported")).toBe("language");
  });

  // The one silence that is correct: the author pressed stop, or the panel
  // unmounted. Raising an alarm for that would train them to ignore all of them.
  it("says nothing when the stop was deliberate", () => {
    expect(faultFrom("aborted")).toBeNull();
  });

  it("still says something for a code it has never seen", () => {
    expect(faultFrom("bad-grammar")).toBe("unknown");
    expect(faultFrom("some-future-code")).toBe("unknown");
    expect(faultFrom("")).toBe("unknown");
  });
});

// A session is the event stream the browser hands us: any number of `result`
// events, then exactly one `end`. These drive it directly, which is the whole
// reason the folding lives outside the hook — the recognition API itself cannot
// be run in a test, so the decisions it feeds have to be reachable without it.
describe("a dictation session, folded event by event", () => {
  const res = (...rs: [string, boolean][]) =>
    rs.map(([transcript, isFinal]) => ({ transcript, isFinal }));

  it("emits a chunk once, when the browser finalizes it", () => {
    let s = startSession();
    const a = applyResult(s, res(["der Weg war schmal", false]));
    expect(a.emit).toBe(""); // still interim — nothing to write yet
    s = a.session;
    const b = applyResult(s, res(["der Weg war schmal", true]));
    expect(b.emit).toBe("der Weg war schmal");
    s = b.session;
    // …and the end has nothing left to say.
    expect(applyEnd(s).emit).toBe("");
  });

  // The bug. The speech service drops the connection, or the stream aborts, or
  // the author taps the mic mid-word: the session ends while a result is still
  // interim. The API will never hand that text over again — our copy is the
  // only one — and it used to be discarded, so words the author had watched
  // appear simply vanished, with no error and nothing in the notes.
  it("commits text the session ended on before the browser finalized it", () => {
    const s = applyResult(startSession(), res(["und dann bergauf", false]));
    expect(s.emit).toBe("");
    expect(applyEnd(s.session).emit).toBe("und dann bergauf");
  });

  it("commits only the un-finalized tail, not the whole utterance again", () => {
    let s = startSession();
    s = applyResult(s, res(["der Weg war schmal", true])).session;
    s = applyResult(s, res(["der Weg war schmal", true], [" und steil", false]))
      .session;
    expect(applyEnd(s).emit).toBe("und steil");
  });

  it("never double-commits a chunk that finalized normally", () => {
    let s = startSession();
    s = applyResult(s, res(["hallo", false])).session;
    const fin = applyResult(s, res(["hallo", true]));
    expect(fin.emit).toBe("hallo");
    expect(applyEnd(fin.session).emit).toBe("");
  });

  it("has nothing to commit when the author never spoke", () => {
    expect(applyEnd(startSession()).emit).toBe("");
  });

  it("treats a whitespace-only interim as nothing", () => {
    const s = applyResult(startSession(), res(["   ", false]));
    expect(applyEnd(s.session).emit).toBe("");
  });

  it("starts the next session clean, so the old text is not re-emitted", () => {
    const ended = applyEnd(
      applyResult(startSession(), res(["kurz", false])).session,
    );
    expect(ended.emit).toBe("kurz");
    // The session it hands back must owe nothing, or tapping the mic again
    // would replay the last words.
    expect(applyEnd(ended.session).emit).toBe("");
    expect(applyResult(ended.session, res(["kurz", true])).emit).toBe("kurz");
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
