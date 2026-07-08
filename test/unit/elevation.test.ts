import { describe, expect, it } from "vitest";
import { smoothElevations, buildElevationSeries } from "@/lib/gpx";

// A LineString track from a list of elevations (x spaced so distance accrues).
const track = (
  eles: number[],
): GeoJSON.FeatureCollection<GeoJSON.LineString> => ({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: eles.map((e, i) => [12 + i * 0.001, 55, e]),
      },
    },
  ],
});

describe("smoothElevations", () => {
  it("removes an isolated spike", () => {
    const flat = Array(15).fill(10);
    flat[7] = 90; // one bad sample
    const out = smoothElevations(flat);
    expect(out).toHaveLength(15);
    expect(Math.max(...out)).toBeLessThan(30); // the 90 m spike is gone
  });

  it("leaves a short series untouched (would otherwise be flattened)", () => {
    expect(smoothElevations([100, 110, 105])).toEqual([100, 110, 105]);
  });
});

describe("buildElevationSeries", () => {
  it("returns null without elevation data", () => {
    const flat2d: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: [[12, 55], [12.001, 55]] },
        },
      ],
    };
    expect(buildElevationSeries(flat2d)).toBeNull();
  });

  it("preserves a real climb (not flattened)", () => {
    const climb = Array.from({ length: 100 }, (_, i) => i * 2); // 0 → 198 m
    const s = buildElevationSeries(track(climb));
    expect(s).not.toBeNull();
    // Smoothing pulls the endpoints in a little, but the climb is clearly kept.
    expect(s!.ascent).toBeGreaterThan(150);
    expect(s!.ascent).toBeLessThan(210);
    expect(s!.descent).toBeLessThan(10);
  });

  it("tames noisy data — ascent is a fraction of the raw up-down sum", () => {
    // A flat baseline buried under spikes: the true climb is ~0.
    const noisy = Array.from(
      { length: 60 },
      (_, i) => 100 + (i % 3 === 0 ? 30 : 0) - (i % 4 === 0 ? 25 : 0),
    );
    const rawSum = noisy.reduce(
      (a, e, i) => (i ? a + Math.abs(e - noisy[i - 1]) : 0),
      0,
    );
    const s = buildElevationSeries(track(noisy));
    expect(s).not.toBeNull();
    expect(s!.ascent).toBeLessThan(rawSum * 0.25);
  });
});
