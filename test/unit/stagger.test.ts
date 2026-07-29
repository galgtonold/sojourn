import { describe, it, expect } from "vitest";
import { staggerDelay, STAGGER_LIMIT, STAGGER_STEP } from "@/lib/stagger";

describe("staggerDelay", () => {
  it("cascades the first cards, so a page load arrives in sequence", () => {
    expect(staggerDelay(0)).toBe(0);
    expect(staggerDelay(1)).toBeCloseTo(STAGGER_STEP, 5);
    expect(staggerDelay(2)).toBeCloseTo(STAGGER_STEP * 2, 5);
  });

  // The bug this exists for: the delay used to be index * 0.05 with no bound,
  // so on a long list the 32nd card waited 1.6s AFTER scrolling to it — and it
  // got worse with every trip added. Below the fold each card already arrives
  // at its own moment, so a positional delay there only makes you wait.
  it("stops delaying once past the first screenful", () => {
    expect(staggerDelay(STAGGER_LIMIT)).toBe(0);
    expect(staggerDelay(STAGGER_LIMIT + 20)).toBe(0);
    expect(staggerDelay(500)).toBe(0);
  });

  it("never exceeds the cascade's own length, however long the list", () => {
    const worst = Math.max(
      ...Array.from({ length: 1000 }, (_, i) => staggerDelay(i)),
    );
    expect(worst).toBeLessThanOrEqual(STAGGER_LIMIT * STAGGER_STEP);
    expect(worst).toBeLessThan(0.5);
  });

  it("treats junk indices as no delay rather than NaN", () => {
    expect(staggerDelay(-1)).toBe(0);
    expect(staggerDelay(Number.NaN)).toBe(0);
  });
});
