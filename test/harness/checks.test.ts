// test/harness/checks.test.ts
import { describe, expect, it } from "vitest";
import { runChecks, requestedQuizCount, type RunResult } from "../../eval/harness/checks";
import type { LoadedFixture } from "../../eval/harness/fixture";

const fx = { ask: "mach ein quiz mit 3 fragen", lang: "de", photoIds: ["p1"] } as unknown as LoadedFixture;

function base(over: Partial<RunResult> = {}): RunResult {
  return {
    fixture: fx,
    title: "Ein kurzer Spaziergang",
    questions: ["Wer war dabei?"],
    body: "## Titel\n\n[photo:p1]\n\n[ask:i1]",
    interactions: [{ id: "i1", kind: "quiz", options: ["a", "b"], correct_index: 0 }],
    captions: [{ id: "p1", caption: "Ein Foto" }],
    ...over,
  };
}

describe("checks", () => {
  it("parses requested quiz count", () => {
    expect(requestedQuizCount("mach ein quiz mit 5 fragen")).toBe(5);
    expect(requestedQuizCount("schreib einfach")).toBeNull();
  });

  it("flags a quiz-count shortfall", () => {
    const r = runChecks(base()); // asked 3, got 1
    const c = r.find((x) => x.name === "quiz-count")!;
    expect(c.pass).toBe(false);
    expect(c.detail).toContain("asked 3");
  });

  it("passes a clean run with the right count", () => {
    const r = runChecks(base({
      fixture: { ...fx, ask: "mach ein quiz mit 1 frage" } as LoadedFixture,
    }));
    expect(r.find((x) => x.name === "quiz-count")!.pass).toBe(true);
    expect(r.find((x) => x.name === "no-dangling-refs")!.pass).toBe(true);
    expect(r.find((x) => x.name === "interactions-valid")!.pass).toBe(true);
  });

  it("checks title shape from run.title, not the body", () => {
    const ok = runChecks(base({ title: "One Day in Lisbon" }));
    expect(ok.find((x) => x.name === "title-shape")!.pass).toBe(true);
    // A colon-subtitle (and over-long) title fails — the case the Lisbon run hit.
    const bad = runChecks(base({ title: "Morning: Miradouros and the Castle Walk" }));
    expect(bad.find((x) => x.name === "title-shape")!.pass).toBe(false);
  });

  it("flags a malformed interaction block", () => {
    // A quiz block with no marked correct answer is malformed.
    const r = runChecks(base({ body: "## Titel\n\n:::quiz Frage?\n- a\n- b\n:::" }));
    expect(r.find((x) => x.name === "interactions-valid")!.pass).toBe(false);
  });
});
