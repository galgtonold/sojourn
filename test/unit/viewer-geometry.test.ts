import { describe, it, expect } from "vitest";
import { intrinsicRatio, slideBox, slideFade } from "@/lib/viewer-geometry";

// Two things the viewer used to get wrong, both visible on every single page.
//
// 1. The blurred wash behind the photo was ONE element, outside the track that
//    the photos ride on, sourced from the committed index. The index commits
//    only after the 260ms slide resolves (`animate(...).then(onIndexChange)`),
//    so the photo finished arriving and THEN the wash swapped underneath it.
//    `slideFade` gives each mounted slide its own wash whose opacity is driven
//    by the same motion value the track rides, so the two move as one.
//
// 2. The slide shrink-wraps its photo, and an <img> with no width/height
//    attributes has no size until it loads. The caption is anchored to the
//    bottom of that box, so it painted mid-screen and jumped to the photo's
//    edge on load. The dimensions are in the database already — `intrinsicRatio`
//    is what lets the box be the right shape before a byte of image arrives.

describe("intrinsicRatio", () => {
  it("reads the shape the database already knows", () => {
    expect(intrinsicRatio({ width: 4032, height: 3024 })).toBeCloseTo(4 / 3, 5);
    expect(intrinsicRatio({ width: 2268, height: 4032 })).toBeCloseTo(0.5625, 5);
  });

  it("agrees with what the browser measures after load", () => {
    // Verified against production: photo 2268x4032 is served downscaled to
    // 1620x2880 — a different SIZE but the same ratio, which is the only thing
    // rotation and the box shape depend on. If these disagreed, a photo would
    // visibly re-shape the moment it loaded, which is the bug being fixed.
    expect(intrinsicRatio({ width: 2268, height: 4032 })).toBeCloseTo(
      intrinsicRatio({ width: 1620, height: 2880 }),
      5,
    );
  });

  it("returns 0 when the dimensions are missing, so measurement still wins", () => {
    // 10 of 140 production photos predate the dimension columns. They must fall
    // back to the old measure-on-load path, not to a bogus square.
    for (const item of [
      { width: null, height: null },
      { width: 100, height: null },
      { width: null, height: 100 },
      {},
    ]) {
      expect(intrinsicRatio(item)).toBe(0);
    }
  });

  it("refuses nonsense rather than returning Infinity or NaN", () => {
    // A zero height would divide to Infinity and rotate every photo forever.
    expect(intrinsicRatio({ width: 100, height: 0 })).toBe(0);
    expect(intrinsicRatio({ width: 0, height: 100 })).toBe(0);
    expect(intrinsicRatio({ width: -4, height: 3 })).toBe(0);
    expect(Number.isFinite(intrinsicRatio({ width: 100, height: 0 }))).toBe(true);
  });
});

describe("slideBox", () => {
  /** Resolve the CSS the way the browser does, for a given viewport. */
  function resolve(css: string, vw: number, vh: number): number {
    const unit = (n: number, u: string) =>
      u === "vw" ? (n / 100) * vw : (n / 100) * vh; // dvh == vh here
    const m = css.match(
      /^min\((\d+)(vw|dvh), calc\((\d+)(vw|dvh) \* ([\d.]+)\)\)$/,
    );
    if (!m) throw new Error(`unparsable: ${css}`);
    return Math.min(
      unit(Number(m[1]), m[2]),
      unit(Number(m[3]), m[4]) * Number(m[5]),
    );
  }

  it("gives a portrait photo the box the browser computes after load", () => {
    // Measured on a real 2560x1384 screen: a 2268x4032 portrait settles at
    // 747x1329 once loaded. Before this it was 0x0 until then.
    const box = slideBox(2268 / 4032, false)!;
    const w = resolve(box.width, 2560, 1384);
    expect(Math.round(w)).toBe(747);
    expect(Math.round(w / Number(box.aspectRatio))).toBe(1329);
  });

  it("is bounded by height for tall photos and by width for wide ones", () => {
    // The two arms of the min(): a panorama runs out of width first, a portrait
    // runs out of height first. Getting this backwards overflows the screen.
    expect(Math.round(resolve(slideBox(4, false)!.width, 2560, 1384))).toBe(2458);
    expect(Math.round(resolve(slideBox(0.5, false)!.width, 2560, 1384))).toBe(664);
  });

  it("swaps the axes when the photo is turned", () => {
    // Turned, width is bounded by the screen's HEIGHT — the same swap the
    // rotated max-* classes make. Using the upright caps here would size a
    // rotated photo against the wrong edge entirely.
    const up = slideBox(1.5, false)!;
    const rot = slideBox(1.5, true)!;
    expect(up.width).toContain("96vw");
    expect(rot.width).toContain("92dvh");
    expect(rot.width).toContain("95vw");
  });

  it("keeps the aspect ratio it was given", () => {
    expect(slideBox(1.5, false)!.aspectRatio).toBe("1.5");
  });

  it("declines to guess when the ratio is unknown", () => {
    // The fallback for photos with no stored dimensions: no style at all, so
    // the max-* classes and measure-on-load behave exactly as before.
    for (const r of [0, -1, NaN, Infinity]) {
      expect(slideBox(r, false)).toBeUndefined();
    }
  });
});

/** Evaluate the keyframes the way framer-motion's useTransform does. */
function fadeAt(off: number, width: number, x: number): number {
  const { input, output } = slideFade(off, width);
  if (x <= input[0]) return output[0];
  if (x >= input[input.length - 1]) return output[output.length - 1];
  for (let i = 1; i < input.length; i++) {
    if (x <= input[i]) {
      const span = input[i] - input[i - 1];
      const f = span === 0 ? 0 : (x - input[i - 1]) / span;
      return output[i - 1] + f * (output[i] - output[i - 1]);
    }
  }
  return output[output.length - 1];
}

describe("slideFade", () => {
  const W = 1000;

  it("shows the centred slide's wash and hides its neighbours'", () => {
    expect(fadeAt(0, W, 0)).toBe(1);
    expect(fadeAt(-1, W, 0)).toBe(0);
    expect(fadeAt(1, W, 0)).toBe(0);
  });

  it("hands over mid-drag instead of after it", () => {
    // The actual complaint: halfway to the next photo, the wash should be
    // halfway too. Before this it was still fully the outgoing photo's.
    expect(fadeAt(0, W, -W / 2)).toBeCloseTo(0.5, 5);
    expect(fadeAt(1, W, -W / 2)).toBeCloseTo(0.5, 5);
  });

  it("is fully handed over by the time the slide lands", () => {
    expect(fadeAt(1, W, -W)).toBe(1);
    expect(fadeAt(0, W, -W)).toBe(0);
    expect(fadeAt(-1, W, W)).toBe(1);
  });

  it("survives the commit without a flash", () => {
    // The seam. At the end of a forward page the track sits at x=-W and the
    // incoming photo is the `+1` cell. Then the index commits: the cells
    // re-map around it, so it becomes `0`, and x resets to 0 in the same
    // paint. Both sides of that swap must read 1, or the wash blinks.
    expect(fadeAt(1, W, -W)).toBe(fadeAt(0, W, 0));
    // And the same going backwards.
    expect(fadeAt(-1, W, W)).toBe(fadeAt(0, W, 0));
  });

  it("keeps a wash lit at every point of the drag", () => {
    // The pair always sums to 1, so there is no position where both neighbours
    // are dark and the reader sees the bare dialog. (Stacked alpha means the
    // mid-drag composite is still marginally lighter than either end — that is
    // what a cross-fade looks like, and at 70% over near-black it is invisible.
    // The property worth pinning is that the wash is never ABSENT.)
    for (const frac of [0, 0.25, 0.5, 0.75, 1]) {
      const x = -W * frac;
      const total = fadeAt(0, W, x) + fadeAt(1, W, x) + fadeAt(-1, W, x);
      expect(total).toBeCloseTo(1, 5);
    }
  });

  it("keeps the keyframes strictly ascending", () => {
    // useTransform requires it; a duplicate or descending stop silently breaks
    // the mapping instead of throwing.
    for (const off of [-1, 0, 1]) {
      for (const w of [0, 1, 375, 1000, 3840]) {
        const { input, output } = slideFade(off, w);
        expect(input.length).toBe(output.length);
        for (let i = 1; i < input.length; i++) {
          expect(input[i]).toBeGreaterThan(input[i - 1]);
        }
      }
    }
  });

  it("still lights the single slide when the viewport is unmeasured", () => {
    // `view.width` is 0 for the first frame on the server-rendered path. A
    // zero-width track must not leave the viewer with no backdrop at all.
    expect(fadeAt(0, 0, 0)).toBe(1);
  });
});
