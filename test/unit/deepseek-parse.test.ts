import { describe, it, expect } from "vitest";
import { parseJsonLoose } from "@/lib/ai/deepseek";

describe("parseJsonLoose", () => {
  it("parses plain JSON", () => {
    expect(parseJsonLoose<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it("strips ```json fences", () => {
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("recovers a JSON object embedded in prose", () => {
    expect(parseJsonLoose('Sure! {"a":1} hope that helps')).toEqual({ a: 1 });
  });

  it("throws when there is no JSON", () => {
    expect(() => parseJsonLoose("not json at all")).toThrow();
  });
});
