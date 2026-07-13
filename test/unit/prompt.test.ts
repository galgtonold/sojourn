import { describe, it, expect } from "vitest";
import {
  langInstruction,
  qaBlock,
  interactionInstruction,
  questionsPrompt,
  normalizeQuestions,
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

  it("questionsPrompt asks for both gap and spark kinds + the JSON shape", () => {
    const en = questionsPrompt("MATERIAL", "STYLE", "en");
    expect(en).toContain("MATERIAL");
    expect(en).toContain("STYLE");
    expect(en).toContain('"gap"');
    expect(en).toContain('"spark"');
    expect(en).toContain('"gap"|"spark"'); // the JSON contract
    expect(en).toMatch(/weather/i); // still excludes weather/location
    const de = questionsPrompt("MATERIAL", "STYLE", "de");
    expect(de).toContain('"gap"');
    expect(de).toContain('"spark"');
    expect(de).toMatch(/Wetter/);
  });
});

describe("normalizeQuestions", () => {
  it("coerces strings, defaults an unknown/missing kind to gap", () => {
    expect(
      normalizeQuestions([
        { text: "A", kind: "spark" },
        "B",
        { text: "C", kind: "weird" },
      ]),
    ).toEqual([
      { text: "A", kind: "spark" },
      { text: "B", kind: "gap" },
      { text: "C", kind: "gap" },
    ]);
  });

  it("drops empties and caps at 6", () => {
    const raw = [
      { text: "  ", kind: "gap" },
      ...Array.from({ length: 8 }, (_, i) => ({ text: `q${i}`, kind: "gap" })),
    ];
    const out = normalizeQuestions(raw);
    expect(out).toHaveLength(6);
    expect(out.every((q) => q.text.trim() !== "")).toBe(true);
  });

  it("returns [] for non-array input", () => {
    expect(normalizeQuestions(null)).toEqual([]);
    expect(normalizeQuestions("nope")).toEqual([]);
  });
});
