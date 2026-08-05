import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";

// Contrast, computed rather than eyeballed.
//
// The palette is well judged: `sand-100/50` — the workhorse muted tone, 93 uses
// — measures 4.66:1 and passes AA on every background. But `/45` (3.97:1) and
// `/35` (2.82:1) had crept in on real text: both halves of a proofreading
// suggestion, the first-run checklist, and a table of Markdown syntax help.
//
// The proofreading dialog was the sharpest case. Its entire purpose is to let
// an author compare a proposed wording change word by word, and both the before
// and the after were rendered at the lowest-contrast tier in the system.
//
// Nudging those to `/50` and `/60` costs nothing visually. This test stops them
// coming back, because nothing else in the pipeline computes a contrast ratio.

const BG = { "ink-950": "#0a0908", "ink-900": "#12100e" };
const FG = "#f2ebe0"; // sand-100

function rgb(hex: string) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}
function luminance([r, g, b]: number[]) {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
/** Flatten a translucent foreground onto an opaque background. */
function over(fg: number[], bg: number[], alpha: number) {
  return fg.map((c, i) => c * alpha + bg[i] * (1 - alpha));
}
function ratio(a: number[], b: number[]) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The lowest ratio `sand-100/<pct>` reaches on any of our backgrounds. */
function worstCase(pct: number) {
  return Math.min(
    ...Object.values(BG).map((bg) => ratio(over(rgb(FG), rgb(bg), pct / 100), rgb(bg))),
  );
}

const AA = 4.5;

describe("the muted text tiers", () => {
  it("passes AA at /50 and above", () => {
    // Guard the guard: if the maths were wrong these would fail too, and the
    // sweep below would be asserting nothing.
    expect(worstCase(50)).toBeGreaterThanOrEqual(AA);
    expect(worstCase(60)).toBeGreaterThanOrEqual(AA);
  });

  it("still fails below it, which is why the sweep exists", () => {
    expect(worstCase(45)).toBeLessThan(AA);
    expect(worstCase(35)).toBeLessThan(AA);
  });
});

describe("no component uses a tier that fails AA", () => {
  const files = globSync("src/**/*.tsx");

  it("finds files to check", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("uses no sand-100 opacity below /50 on text", () => {
    // TEXT only. The same utility colours lucide icons, and non-text content is
    // governed by 1.4.11 at 3:1 — with decorative icons beside their own label
    // exempt altogether. Sweeping those in here would have meant restyling
    // every chevron in the admin to satisfy a rule that does not apply to them.
    // The tell is a capitalised JSX component on the line: `<ArrowRight …`.
    const ICON_LINE = /<[A-Z][A-Za-z0-9]*\s[^>]*text-sand-100\//;
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      for (const line of src.split(/\r?\n/)) {
        if (ICON_LINE.test(line)) continue;
        for (const m of line.matchAll(/text-sand-100\/(\d+)/g)) {
          const pct = Number(m[1]);
          if (worstCase(pct) < AA) {
            offenders.push(`${file}: text-sand-100/${pct} (${worstCase(pct).toFixed(2)}:1)`);
          }
        }
      }
    }
    expect(
      offenders,
      `these fall below AA's ${AA}:1 for normal-size text; /50 is the lowest tier that passes`,
    ).toEqual([]);
  });
});
