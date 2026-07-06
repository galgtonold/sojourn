import { describe, expect, it } from "vitest";
import {
  trackSamples,
  locateAtUtc,
  detectTripOffsetMin,
  geotagPhotos,
  type TrackSample,
} from "@/lib/geotag-from-track";

const fc = (pts: Array<[number, number, number | null]>) =>
  ({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { times: pts.map((p) => p[2]) },
        geometry: { type: "LineString", coordinates: pts.map((p) => [p[0], p[1]]) },
      },
    ],
  }) as GeoJSON.FeatureCollection<GeoJSON.LineString>;

const S: TrackSample[] = [
  { ms: 1000, lat: 0, lng: 0 },
  { ms: 2000, lat: 10, lng: 20 },
];

describe("trackSamples", () => {
  it("flattens features to sorted samples and drops timeless points", () => {
    const s = trackSamples([fc([[0, 0, 2000], [0, 1, null], [0, 2, 1000]])]);
    expect(s).toEqual([
      { ms: 1000, lat: 2, lng: 0 },
      { ms: 2000, lat: 0, lng: 0 },
    ]);
  });
});

describe("locateAtUtc", () => {
  it("interpolates linearly between bracketing samples", () => {
    expect(locateAtUtc(S, 1500)).toEqual({ lat: 5, lng: 10 });
  });
  it("returns the exact sample on a direct hit", () => {
    expect(locateAtUtc(S, 2000)).toEqual({ lat: 10, lng: 20 });
  });
  it("snaps within edge tolerance just outside the range", () => {
    expect(locateAtUtc(S, 900, { edgeToleranceMs: 200 })).toEqual({ lat: 0, lng: 0 });
  });
  it("returns null well outside the range", () => {
    expect(locateAtUtc(S, 100000, { edgeToleranceMs: 200 })).toBeNull();
  });
  it("refuses to interpolate across a gap larger than maxGapMs", () => {
    const gapped: TrackSample[] = [
      { ms: 0, lat: 0, lng: 0 },
      { ms: 60 * 60_000, lat: 100, lng: 100 },
    ];
    expect(locateAtUtc(gapped, 30 * 60_000, { maxGapMs: 10 * 60_000 })).toBeNull();
  });
});

describe("detectTripOffsetMin", () => {
  it("picks the whole-hour offset that lands the most photos in range", () => {
    // Track spans 12:00–13:00 UTC. Photos are local +02:00 (14:00–15:00 local).
    const samples: TrackSample[] = [
      { ms: Date.parse("2026-07-05T12:00:00Z"), lat: 0, lng: 0 },
      { ms: Date.parse("2026-07-05T13:00:00Z"), lat: 1, lng: 1 },
    ];
    const photos = [
      { localMs: Date.parse("2026-07-05T14:10:00Z"), offsetMin: null },
      { localMs: Date.parse("2026-07-05T14:50:00Z"), offsetMin: null },
    ];
    expect(detectTripOffsetMin(photos, samples)).toBe(120);
  });
});

describe("geotagPhotos", () => {
  it("places offset-carrying and offset-less photos, null outside coverage", () => {
    // Samples 8 min apart — a real track's points are densely spaced; a gap
    // wider than maxGapMs (default 10 min) is a recording pause we won't
    // interpolate across, so keep the fixture under that threshold.
    const samples: TrackSample[] = [
      { ms: Date.parse("2026-07-05T12:00:00Z"), lat: 0, lng: 0 },
      { ms: Date.parse("2026-07-05T12:08:00Z"), lat: 10, lng: 10 },
    ];
    const photos = [
      // exact offset: 14:04+02:00 -> 12:04 UTC -> midpoint
      { localMs: Date.parse("2026-07-05T14:04:00Z"), offsetMin: 120 },
      // no offset: relies on detected +120 -> 12:04 UTC -> midpoint
      { localMs: Date.parse("2026-07-05T14:04:00Z"), offsetMin: null },
      // far outside coverage
      { localMs: Date.parse("2026-07-05T20:00:00Z"), offsetMin: 120 },
    ];
    const out = geotagPhotos(photos, samples);
    expect(out[0]).toEqual({ lat: 5, lng: 5 });
    expect(out[1]).toEqual({ lat: 5, lng: 5 });
    expect(out[2]).toBeNull();
  });
});
