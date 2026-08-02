import { describe, it, expect } from "vitest";
import {
  OVERVIEW_TOLERANCE_M,
  DETAIL_TOLERANCE_M,
  DETAIL_FROM_ZOOM,
  metresPerPixel,
  needsDetail,
} from "@/lib/map-lod";

// The overview tier only holds up if its error stays under a pixel for every
// zoom it is actually shown at. That is arithmetic, not taste, so it is pinned
// here: if someone lowers the switch zoom or coarsens the tolerance, the sums
// stop working and this fails.

describe("metresPerPixel", () => {
  it("matches the standard web-mercator ladder at the equator", () => {
    expect(metresPerPixel(0)).toBeCloseTo(156543, 0);
    expect(metresPerPixel(10)).toBeCloseTo(152.87, 1);
    expect(metresPerPixel(16)).toBeCloseTo(2.39, 2);
  });

  it("halves with every zoom level", () => {
    for (const z of [3, 8, 14]) {
      expect(metresPerPixel(z + 1)).toBeCloseTo(metresPerPixel(z) / 2, 6);
    }
  });
});

describe("the overview tier is invisible at the zooms it serves", () => {
  it("stays under a pixel of error right up to the switch", () => {
    // The last zoom still drawn from the overview tier.
    const worst = metresPerPixel(DETAIL_FROM_ZOOM - 1);
    expect(OVERVIEW_TOLERANCE_M).toBeLessThan(worst);
    // …and with room to spare, not just barely.
    expect(OVERVIEW_TOLERANCE_M).toBeLessThan(worst / 2);
  });

  it("is coarser than the detail tier, or it would buy nothing", () => {
    expect(OVERVIEW_TOLERANCE_M).toBeGreaterThan(DETAIL_TOLERANCE_M);
  });

  it("keeps the promise the detail tier exists for: metre-accurate up close", () => {
    // At the switch zoom and beyond, a metre is still well under a pixel.
    expect(DETAIL_TOLERANCE_M).toBeLessThan(metresPerPixel(DETAIL_FROM_ZOOM));
  });
});

describe("needsDetail", () => {
  it("is false while the overview is good enough", () => {
    expect(needsDetail(0)).toBe(false);
    expect(needsDetail(DETAIL_FROM_ZOOM - 0.01)).toBe(false);
  });

  it("turns on at the threshold and stays on", () => {
    expect(needsDetail(DETAIL_FROM_ZOOM)).toBe(true);
    expect(needsDetail(DETAIL_FROM_ZOOM + 4)).toBe(true);
    expect(needsDetail(22)).toBe(true);
  });
});
