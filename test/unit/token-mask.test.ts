import { describe, expect, it } from "vitest";
import {
  maskProtectedTokens,
  allMasksPresent,
  restoreProtectedTokens,
  stripWrappingCodeFence,
} from "@/lib/ai/token-mask";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

const QUIZ = `:::quiz Wie hoch ist der Gipfel?
- 3000 m
- = 4158 m
- 5000 m
> Ein Satz danach.
:::`;

describe("maskProtectedTokens", () => {
  it("masks photo tags and a quiz block, and round-trips back verbatim", () => {
    const body = `## Titel\n\nText\n[photo:${A}]\n\nmehr\n\n${QUIZ}\n\nSchluss [photo:${B}]`;
    const { masked, tokens } = maskProtectedTokens(body);
    expect(tokens).toEqual([`[photo:${A}]`, QUIZ, `[photo:${B}]`]);
    // No raw tags or block fences survive in the masked text.
    expect(masked).not.toContain("[photo:");
    expect(masked).not.toContain(":::quiz");
    expect(masked).toContain("[[KEEP-0]]");
    expect(allMasksPresent(masked, tokens)).toBe(true);
    expect(restoreProtectedTokens(masked, tokens)).toBe(body);
  });

  it("survives the model reordering and rewording around the sentinels", () => {
    const body = `Eins [photo:${A}]\n\nZwei [photo:${B}]`;
    const { masked, tokens } = maskProtectedTokens(body);
    // Simulate a homogenize pass that rewrote prose but kept the sentinels.
    const rewritten = masked
      .replace("Eins", "Zuerst")
      .replace("Zwei", "Danach dann");
    expect(allMasksPresent(rewritten, tokens)).toBe(true);
    expect(restoreProtectedTokens(rewritten, tokens)).toBe(
      `Zuerst [photo:${A}]\n\nDanach dann [photo:${B}]`,
    );
  });

  it("detects a dropped sentinel", () => {
    const body = `a [photo:${A}] b [photo:${B}]`;
    const { masked, tokens } = maskProtectedTokens(body);
    const lost = masked.replace("[[KEEP-1]]", "");
    expect(allMasksPresent(lost, tokens)).toBe(false);
  });

  it("detects a duplicated sentinel", () => {
    const body = `a [photo:${A}]`;
    const { masked, tokens } = maskProtectedTokens(body);
    expect(allMasksPresent(masked + " " + masked, tokens)).toBe(false);
  });

  it("does not confuse [[KEEP-1]] with [[KEEP-10]]", () => {
    const tokens = Array.from({ length: 11 }, (_, i) => `[photo:tok${i}]`);
    const masked = tokens.map((_, i) => `[[KEEP-${i}]]`).join(" ");
    expect(allMasksPresent(masked, tokens)).toBe(true);
  });

  it("restores token text that contains a $ without mangling it", () => {
    const body = `Preis [photo:${A}]`;
    const { masked, tokens } = maskProtectedTokens(body);
    // Force a token with a $ to prove the replacement is literal.
    tokens[0] = "$5 [photo:x]";
    expect(restoreProtectedTokens(masked, tokens)).toBe(`Preis $5 [photo:x]`);
  });

  it("leaves a body with no protected tokens unchanged", () => {
    const body = "Nur Prosa, keine Tags.";
    const { masked, tokens } = maskProtectedTokens(body);
    expect(masked).toBe(body);
    expect(tokens).toEqual([]);
    expect(allMasksPresent(masked, tokens)).toBe(true);
    expect(restoreProtectedTokens(masked, tokens)).toBe(body);
  });
});

describe("stripWrappingCodeFence", () => {
  it("unwraps a fence enclosing the whole answer", () => {
    expect(stripWrappingCodeFence("```markdown\n## Titel\n\nText\n```")).toBe(
      "## Titel\n\nText",
    );
  });

  it("unwraps a bare ``` fence with no language tag", () => {
    expect(stripWrappingCodeFence("```\nHallo\n```")).toBe("Hallo");
  });

  it("leaves prose without a wrapping fence untouched", () => {
    const body = "## Titel\n\nText, ganz ohne Fence.";
    expect(stripWrappingCodeFence(body)).toBe(body);
  });

  it("does not strip a code block that sits inside the prose", () => {
    const body = "## Titel\n\n```\ncode\n```\n\nmehr Text";
    expect(stripWrappingCodeFence(body)).toBe(body);
  });
});
