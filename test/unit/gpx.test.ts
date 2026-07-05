import { describe, it, expect } from "vitest";
import {
  formatDistance,
  buildElevationSeries,
  splitOnGaps,
  type GpxPoint,
  runToParsed,
} from "@/lib/gpx";

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

describe("splitOnGaps", () => {
  // A point at longitude 0; `lat` degrees ≈ lat * 111_320 m of northward
  // distance, so 0.0005° ≈ 56 m (a walking step) and 0.2° ≈ 22 km (a train
  // hop). `tMin` is minutes since start, or null for a timestamp-less point.
  const pt = (lat: number, tMin: number | null): GpxPoint => ({
    coord: [0, lat],
    time: tMin == null ? null : tMin * 60_000,
  });
  const lats = (runs: GpxPoint[][]) =>
    runs.map((r) => r.map((p) => p.coord[1]));

  it("splits one walk / train / walk pause into two fragments", () => {
    const runs = splitOnGaps([
      pt(0.0, 0),
      pt(0.0005, 1),
      pt(0.001, 2),
      pt(0.201, 32), // +22 km, +30 min → gap
      pt(0.2015, 33),
      pt(0.202, 34),
    ]);
    expect(runs).toHaveLength(2);
    expect(runs[0]).toHaveLength(3);
    expect(runs[1]).toHaveLength(3);
    // The 22 km transit hop is never inside a fragment, so no fragment's
    // length can include it.
    expect(runs[0].at(-1)!.coord[1]).toBe(0.001);
    expect(runs[1][0].coord[1]).toBe(0.201);
  });

  it("splits two transit pauses into three fragments", () => {
    const runs = splitOnGaps([
      pt(0.0, 0),
      pt(0.0005, 1),
      pt(0.2005, 31), // gap 1
      pt(0.201, 32),
      pt(0.401, 62), // gap 2
      pt(0.4015, 63),
    ]);
    expect(lats(runs)).toEqual([
      [0.0, 0.0005],
      [0.2005, 0.201],
      [0.401, 0.4015],
    ]);
  });

  it("keeps a long stationary break as one fragment (fails distance test)", () => {
    const runs = splitOnGaps([
      pt(0.0, 0),
      pt(0.0005, 1),
      pt(0.0005, 16), // same spot, 15 min later
      pt(0.001, 17),
    ]);
    expect(runs).toHaveLength(1);
  });

  it("keeps a short far dropout as one fragment (fails time test)", () => {
    const runs = splitOnGaps([
      pt(0.0, 0),
      pt(0.006, 2), // ~668 m but only 2 min → not a gap
    ]);
    expect(runs).toHaveLength(1);
  });

  it("splits on a 500 m jump when timestamps are missing", () => {
    const runs = splitOnGaps([
      pt(0.0, null),
      pt(0.001, null), // ~111 m
      pt(0.01, null), // ~1 km jump → gap
      pt(0.0105, null),
    ]);
    expect(lats(runs)).toEqual([
      [0.0, 0.001],
      [0.01, 0.0105],
    ]);
  });

  it("keeps a timestamp-less steady walk as one fragment", () => {
    const runs = splitOnGaps([
      pt(0.0, null),
      pt(0.001, null),
      pt(0.002, null),
    ]);
    expect(runs).toHaveLength(1);
  });

  it("returns a single fragment for a clean walk", () => {
    const runs = splitOnGaps([pt(0.0, 0), pt(0.0005, 1), pt(0.001, 2)]);
    expect(runs).toHaveLength(1);
  });
});

describe("runToParsed", () => {
  it("emits per-point epoch-ms times aligned with coordinates", () => {
    const p = runToParsed("t", [
      { coord: [0, 0], time: 1000 },
      { coord: [0, 1], time: 2000 },
      { coord: [0, 2], time: null },
    ]);
    const f = p.geojson.features[0];
    expect(f.geometry.coordinates).toHaveLength(3);
    expect((f.properties as { times: (number | null)[] }).times).toEqual([
      1000, 2000, null,
    ]);
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
