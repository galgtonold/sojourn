import { describe, it, expect } from "vitest";
import {
  langInstruction,
  qaBlock,
  interactionInstruction,
} from "@/lib/ai/prompt";

describe("prompt builders", () => {
  it("langInstruction switches language", () => {
    expect(langInstruction("en")).toMatch(/English/);
    expect(langInstruction("de")).toMatch(/Deutsch/);
  });

  it("qaBlock includes only answered questions, or nothing", () => {
    expect(qaBlock([], "en")).toBe("");
    expect(qaBlock([{ question: "Q", answer: "" }], "en")).toBe("");
    const block = qaBlock(
      [
        { question: "Who?", answer: "Us" },
        { question: "Skip", answer: "  " },
      ],
      "en",
    );
    expect(block).toContain("Who?");
    expect(block).toContain("Us");
    expect(block).not.toContain("Skip");
  });

  it("interactionInstruction describes the right syntax per kind/lang", () => {
    const quizEn = interactionInstruction("quiz", "summit height", "en");
    expect(quizEn).toContain(":::quiz");
    expect(quizEn).toContain("«=»");
    expect(quizEn).toContain("summit height");

    const pollDe = interactionInstruction("poll", "lieblingspass", "de");
    expect(pollDe).toContain(":::poll");
    expect(pollDe).toContain("GENAU EINE");
    expect(pollDe).toContain("lieblingspass");

    // Cover the remaining two branches (poll/EN, quiz/DE).
    expect(interactionInstruction("poll", "x", "en")).toContain("no correct answer");
    expect(interactionInstruction("quiz", "y", "de")).toContain("«=»");
  });
});
