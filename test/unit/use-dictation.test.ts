import { describe, it, expect } from "vitest";
import {
  appendTranscript,
  sessionTranscript,
  newFinalDelta,
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

describe("newFinalDelta", () => {
  it("returns only the growth beyond what's already committed", () => {
    expect(newFinalDelta("Heute waren wir", "Heute ")).toBe("waren wir");
  });
  it("returns the whole thing when nothing is committed yet", () => {
    expect(newFinalDelta("Heute", "")).toBe("Heute");
  });
  it("returns empty when the finalized text is re-delivered unchanged", () => {
    expect(newFinalDelta("Heute waren wir", "Heute waren wir")).toBe("");
  });
  it("returns empty when nothing has grown", () => {
    expect(newFinalDelta("Heute", "Heute waren wir")).toBe("");
  });

  it("re-delivering the same session yields no new text (the doubling bug)", () => {
    // One sentence, spoken once, finalized by the engine.
    const results = [
      { transcript: "mal schauen ob das jetzt besser klappt", isFinal: true as const },
    ];
    // First event: the whole sentence is new.
    let committed = "";
    const first = sessionTranscript(results);
    const d1 = newFinalDelta(first.finalText, committed);
    committed = first.finalText;
    expect(d1).toBe("mal schauen ob das jetzt besser klappt");
    // The engine re-delivers the identical cumulative results (or a restart
    // replays them): the delta must be empty — no second copy appended.
    const second = sessionTranscript(results);
    expect(newFinalDelta(second.finalText, committed)).toBe("");
  });
});
