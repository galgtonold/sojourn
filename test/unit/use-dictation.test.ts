import { describe, it, expect } from "vitest";
import {
  appendTranscript,
  sessionTranscript,
  appendDelta,
} from "@/lib/use-dictation";

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

describe("sessionTranscript", () => {
  it("concatenates the finalized parts and collects the interim separately", () => {
    const r = sessionTranscript([
      { transcript: "Heute ", isFinal: true },
      { transcript: "waren wir", isFinal: true },
      { transcript: "am Hafen", isFinal: false },
    ]);
    expect(r.finalText).toBe("Heute waren wir");
    expect(r.interim).toBe("am Hafen");
  });
});

describe("appendDelta", () => {
  it("appends the whole thing when nothing is committed yet", () => {
    expect(appendDelta("", "okay noch mal einen Test")).toBe(
      "okay noch mal einen Test",
    );
  });
  it("appends only the growth within a session", () => {
    expect(appendDelta("okay noch", "okay noch mal")).toBe(" mal");
  });
  it("keeps text that doesn't overlap", () => {
    expect(appendDelta("hallo", "welt")).toBe("welt");
  });
  it("preserves a legitimate repeated word (only the first overlaps)", () => {
    expect(appendDelta("das", "das das")).toBe(" das");
  });

  // The reported doubling: after a session finalizes a sentence, a restart
  // re-recognizes trailing audio — or re-delivers the whole sentence. appendDelta
  // must drop the overlap so nothing doubles.
  it("drops re-captured trailing audio (…MikrofonMikrofon)", () => {
    const committed = "okay noch mal einen Test mit dem Mikrofon";
    expect(appendDelta(committed, "Mikrofon")).toBe("");
  });
  it("drops an overlapping re-capture and keeps only the new tail", () => {
    expect(appendDelta("okay noch mal einen Test", "einen Test mit dem")).toBe(
      " mit dem",
    );
  });
  it("drops a whole re-delivered sentence after a restart (no second copy)", () => {
    const sentence = "okay noch mal einen Test mit dem Mikrofon";
    expect(appendDelta(sentence, sentence)).toBe("");
  });
});
