import { describe, it, expect } from "vitest";
import {
  parseDirectives,
  specProblems,
  validateBody,
} from "@/lib/interactions-parse";

describe("parseDirectives", () => {
  it("parses a poll block with question and options", () => {
    const [d] = parseDirectives(
      "intro\n\n:::poll Which pass first?\n- Gemmi\n- Furka\n:::\n\noutro",
    );
    expect(d.kind).toBe("poll");
    expect(d.question).toBe("Which pass first?");
    expect(d.options).toEqual(["Gemmi", "Furka"]);
    expect(d.correctIndex).toBeNull();
    expect(d.problems).toEqual([]);
  });

  it("parses a quiz with the = correct marker and a > explanation", () => {
    const [d] = parseDirectives(
      ":::quiz How high?\n- 3000 m\n- = 4158 m\n- 5000 m\n> It is 4158 m.\n:::",
    );
    expect(d.kind).toBe("quiz");
    expect(d.options).toEqual(["3000 m", "4158 m", "5000 m"]);
    expect(d.correctIndex).toBe(1);
    expect(d.explanation).toBe("It is 4158 m.");
    expect(d.problems).toEqual([]);
  });

  it("supports * bullets and [x] correct markers", () => {
    const [d] = parseDirectives(":::quiz Q\n* a\n* [x] b\n:::");
    expect(d.options).toEqual(["a", "b"]);
    expect(d.correctIndex).toBe(1);
  });

  it("reports problems for malformed blocks", () => {
    expect(specProblems(parseDirectives(":::poll \n- only one\n:::")[0])).toEqual([
      "question",
      "options",
    ]);
    expect(specProblems(parseDirectives(":::quiz Q\n- a\n- b\n:::")[0])).toEqual([
      "correct",
    ]);
  });

  it("finds multiple blocks with correct spans", () => {
    const body = "a\n:::poll P\n- x\n- y\n:::\nb\n:::quiz Q\n- m\n- = n\n:::\nc";
    const ds = parseDirectives(body);
    expect(ds).toHaveLength(2);
    expect(body.slice(ds[0].start, ds[0].end)).toContain(":::poll P");
    expect(body.slice(ds[1].start, ds[1].end)).toContain(":::quiz Q");
  });
});

describe("validateBody", () => {
  const ctx = {
    photoIds: ["photo-a"],
    photoCount: 1,
    interactionIds: ["ask-a"],
    interactionCount: 1,
  };

  it("accepts valid id and numeric references", () => {
    expect(validateBody("[photo:photo-a] [ask:ask-a] [photo:1] [ask:1]", ctx)).toEqual(
      [],
    );
  });

  it("flags dangling photo and ask references", () => {
    const issues = validateBody("[photo:nope] and [ask:nope]", ctx);
    expect(issues).toContainEqual({ type: "unknown-photo", ref: "nope" });
    expect(issues).toContainEqual({ type: "unknown-ask", ref: "nope" });
  });

  it("flags malformed inline blocks but not well-formed ones", () => {
    expect(validateBody(":::poll Good\n- a\n- b\n:::", ctx)).toEqual([]);
    const issues = validateBody(":::quiz Q\n- a\n- b\n:::", ctx);
    expect(issues).toContainEqual({
      type: "bad-interaction",
      kind: "quiz",
      problems: ["correct"],
    });
  });
});
