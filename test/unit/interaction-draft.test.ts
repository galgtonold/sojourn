import { describe, it, expect } from "vitest";
import {
  buildInteractionPayload,
  type InteractionDraft,
} from "@/lib/interaction-draft";

const draft = (over: Partial<InteractionDraft> = {}): InteractionDraft => ({
  kind: "poll",
  question: "Where next?",
  options: ["Alps", "Coast"],
  correctIndex: 0,
  explanation: "",
  ...over,
});

describe("buildInteractionPayload — validation", () => {
  it("rejects a blank question", () => {
    expect(buildInteractionPayload(draft({ question: "   " }))).toEqual({
      ok: false,
      error: "question",
    });
  });

  it("rejects fewer than two non-blank options", () => {
    expect(buildInteractionPayload(draft({ options: ["Only", "  "] }))).toEqual({
      ok: false,
      error: "options",
    });
  });

  it("trims the question and drops blank options", () => {
    const res = buildInteractionPayload(
      draft({ question: "  Where?  ", options: ["A", " ", "B "] }),
    );
    expect(res).toEqual({
      ok: true,
      payload: {
        kind: "poll",
        question: "Where?",
        options: ["A", "B"],
        correct_index: null,
        explanation: null,
      },
    });
  });
});

describe("buildInteractionPayload — poll", () => {
  it("stores no correct_index or explanation even if a draft carries them", () => {
    const res = buildInteractionPayload(
      draft({ kind: "poll", correctIndex: 1, explanation: "ignored" }),
    );
    expect(res).toMatchObject({
      ok: true,
      payload: { correct_index: null, explanation: null },
    });
  });
});

describe("buildInteractionPayload — quiz correct_index remap", () => {
  it("keeps the index when there are no blanks", () => {
    const res = buildInteractionPayload(
      draft({ kind: "quiz", options: ["A", "B", "C"], correctIndex: 2 }),
    );
    expect(res).toMatchObject({ ok: true, payload: { correct_index: 2 } });
  });

  it("remaps the index past a leading blank (the silent-wrong-answer bug)", () => {
    // Raw options ["", "Right", "Wrong"], correct = index 1 ("Right").
    // After filtering, "Right" is at index 0 — NOT 1, which would be "Wrong".
    const res = buildInteractionPayload(
      draft({ kind: "quiz", options: ["", "Right", "Wrong"], correctIndex: 1 }),
    );
    expect(res).toEqual({
      ok: true,
      payload: {
        kind: "quiz",
        question: "Where next?",
        options: ["Right", "Wrong"],
        correct_index: 0,
        explanation: null,
      },
    });
  });

  it("accepts a valid answer sitting past a blank (old check wrongly rejected it)", () => {
    // Raw ["A", "", "B"], correct = index 2 ("B"). cleanOptions = ["A","B"];
    // the old `correctIndex >= cleanOptions.length` (2 >= 2) rejected this.
    const res = buildInteractionPayload(
      draft({ kind: "quiz", options: ["A", "", "B"], correctIndex: 2 }),
    );
    expect(res).toMatchObject({
      ok: true,
      payload: { options: ["A", "B"], correct_index: 1 },
    });
  });

  it("rejects a quiz whose selected option is blank", () => {
    const res = buildInteractionPayload(
      draft({ kind: "quiz", options: ["A", "B", ""], correctIndex: 2 }),
    );
    expect(res).toEqual({ ok: false, error: "correct" });
  });

  it("rejects a quiz whose correct index is out of range", () => {
    const res = buildInteractionPayload(
      draft({ kind: "quiz", options: ["A", "B"], correctIndex: 5 }),
    );
    expect(res).toEqual({ ok: false, error: "correct" });
  });

  it("keeps a trimmed explanation, nulls a blank one", () => {
    const kept = buildInteractionPayload(
      draft({ kind: "quiz", explanation: "  because  " }),
    );
    expect(kept).toMatchObject({ ok: true, payload: { explanation: "because" } });
    const nulled = buildInteractionPayload(
      draft({ kind: "quiz", explanation: "   " }),
    );
    expect(nulled).toMatchObject({ ok: true, payload: { explanation: null } });
  });
});
