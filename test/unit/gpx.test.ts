import { describe, it, expect } from "vitest";
import { formatDistance, buildElevationSeries } from "@/lib/gpx";

describe("formatDistance", () => {
  it("returns empty for falsy input", () => {
    expect(formatDistance(null)).toBe("");
    expect(formatDistance(undefined)).toBe("");
    expect(formatDistance(0)).toBe("");
  });
  it("shows metres below 1 km", () => {
    expect(formatDistance(500)).toBe("500 m");
    expect(formatDistance(999)).toBe("999 m");
  });
  it("shows kilometres with one decimal at/above 1 km", () => {
    expect(formatDistance(1000)).toBe("1.0 km");
    expect(formatDistance(1540)).toBe("1.5 km");
  });
});

describe("buildElevationSeries", () => {
  const fc = (coords: number[][]) =>
    ({
      type: "FeatureCollection",
      features: [{ geometry: { type: "LineString", coordinates: coords } }],
    }) as GeoJSON.FeatureCollection<GeoJSON.LineString>;

  it("computes ascent, descent, min/max and distance", () => {
    const s = buildElevationSeries(
      fc([
        [0, 0, 100],
        [0, 0.001, 110],
        [0, 0.002, 105],
      ]),
    );
    expect(s).not.toBeNull();
    expect(s!.points).toHaveLength(3);
    expect(s!.ascent).toBeCloseTo(10, 6);
    expect(s!.descent).toBeCloseTo(5, 6);
    expect(s!.min).toBe(100);
    expect(s!.max).toBe(110);
    expect(s!.distanceM).toBeGreaterThan(0);
  });

  it("returns null without elevation data", () => {
    expect(
      buildElevationSeries(
        fc([
          [0, 0],
          [0, 0.001],
        ]),
      ),
    ).toBeNull();
  });

  it("returns null for too few points", () => {
    expect(buildElevationSeries(fc([[0, 0, 100]]))).toBeNull();
    expect(
      buildElevationSeries({
        type: "FeatureCollection",
        features: [],
      }),
    ).toBeNull();
  });
});
