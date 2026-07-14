import { orderJourneyStops, type OrderTrack } from "@/lib/journey-connector";
import { describe, expect, it } from "vitest";
import {
  buildConnectorSegments,
  type ConnectorTrack,
} from "@/lib/journey-connector";

const track = (
  startedAt: string,
  endedAt: string,
  coords: number[][],
): ConnectorTrack => ({ startedAt, endedAt, coords });

describe("buildConnectorSegments", () => {
  it("bridges the gap between two tracks but never retraces a track", () => {
    const segs = buildConnectorSegments(
      [
        track("2025-08-13T10:00:00Z", "2025-08-13T11:00:00Z", [[0, 0], [1, 1]]),
        track("2025-08-13T12:00:00Z", "2025-08-13T13:00:00Z", [[2, 2], [3, 3]]),
      ],
      [],
    );
    // Only the end-of-A → start-of-B bridge; the two track spans are solid.
    expect(segs).toEqual([[[1, 1], [2, 2]]]);
  });

  it("routes a between-tracks photo into the bridge", () => {
    const segs = buildConnectorSegments(
      [
        track("2025-08-13T10:00:00Z", "2025-08-13T11:00:00Z", [[0, 0], [1, 1]]),
        track("2025-08-13T12:00:00Z", "2025-08-13T13:00:00Z", [[2, 2], [3, 3]]),
      ],
      [{ takenAt: "2025-08-13T11:30:00Z", lng: 1.5, lat: 1.5 }],
    );
    expect(segs).toEqual([
      [[1, 1], [1.5, 1.5]],
      [[1.5, 1.5], [2, 2]],
    ]);
  });

  it("drops a photo taken during a track's timeline", () => {
    const segs = buildConnectorSegments(
      [
        track("2025-08-13T10:00:00Z", "2025-08-13T11:00:00Z", [[0, 0], [1, 1]]),
        track("2025-08-13T12:00:00Z", "2025-08-13T13:00:00Z", [[2, 2], [3, 3]]),
      ],
      [{ takenAt: "2025-08-13T10:30:00Z", lng: 9, lat: 9 }],
    );
    expect(segs).toEqual([[[1, 1], [2, 2]]]);
    expect(JSON.stringify(segs)).not.toContain("9");
  });

  it("connects consecutive photos when there is no track between them", () => {
    const segs = buildConnectorSegments(
      [],
      [
        { takenAt: "2025-08-14T09:00:00Z", lng: 0, lat: 0 },
        { takenAt: "2025-08-14T10:00:00Z", lng: 1, lat: 1 },
      ],
    );
    expect(segs).toEqual([[[0, 0], [1, 1]]]);
  });

  it("returns nothing when no track times or photo times are present", () => {
    const segs = buildConnectorSegments(
      [{ startedAt: null, endedAt: null, coords: [[0, 0], [1, 1]] }],
      [{ takenAt: null, lng: 2, lat: 2 }],
    );
    expect(segs).toEqual([]);
  });

  it("with the clamp, ignores a photo taken outside the tracks' window", () => {
    const segs = buildConnectorSegments(
      [
        track("2026-07-06T09:00:00Z", "2026-07-06T13:00:00Z", [[0, 0], [1, 1]]),
        track("2026-07-06T14:00:00Z", "2026-07-06T15:00:00Z", [[2, 2], [3, 3]]),
      ],
      [{ takenAt: "2026-07-05T15:00:00Z", lng: 9, lat: 9 }], // the day before
      { clampPhotosToTrackWindow: true },
    );
    // Only the track→track bridge; the stray day-before photo is not woven in.
    expect(segs).toEqual([[[1, 1], [2, 2]]]);
    expect(JSON.stringify(segs)).not.toContain("9");
  });

  it("without the clamp, a stray earlier photo still anchors (default)", () => {
    const segs = buildConnectorSegments(
      [track("2026-07-06T09:00:00Z", "2026-07-06T13:00:00Z", [[0, 0], [1, 1]])],
      [{ takenAt: "2026-07-05T15:00:00Z", lng: 9, lat: 9 }],
    );
    // Preserves the journey-explorer behaviour: photo precedes the track, so it
    // bridges photo → track start.
    expect(segs).toEqual([[[9, 9], [0, 0]]]);
  });

  it("with the clamp, still weaves a photo between two tracks (a ferry gap)", () => {
    const segs = buildConnectorSegments(
      [
        track("2026-07-06T09:00:00Z", "2026-07-06T13:00:00Z", [[0, 0], [1, 1]]),
        track("2026-07-06T14:00:00Z", "2026-07-06T15:00:00Z", [[2, 2], [3, 3]]),
      ],
      [{ takenAt: "2026-07-06T13:30:00Z", lng: 1.5, lat: 1.5 }], // during the gap
      { clampPhotosToTrackWindow: true },
    );
    expect(segs).toEqual([
      [[1, 1], [1.5, 1.5]],
      [[1.5, 1.5], [2, 2]],
    ]);
  });
});

describe("orderJourneyStops", () => {
  type TStop = {
    lng: number;
    lat: number;
    order?: number;
    takenAt?: string;
    id?: string;
  };
  const at = (lng: number, lat: number, extra: Partial<TStop> = {}): TStop => ({
    lng,
    lat,
    ...extra,
  });

  it("uses the explicit author order when every stop has one (even if timed)", () => {
    const stops = [
      at(0, 0, { order: 2, takenAt: "2026-07-01T00:00:00Z" }),
      at(0, 0, { order: 1, takenAt: "2026-07-05T00:00:00Z" }),
    ];
    expect(orderJourneyStops(stops, []).map((s) => s.order)).toEqual([1, 2]);
  });

  it("falls to chronological order when none has an order but all are timed", () => {
    const stops = [
      at(0, 0, { takenAt: "2026-07-05T00:00:00Z", id: "b" }),
      at(0, 0, { takenAt: "2026-07-01T00:00:00Z", id: "a" }),
    ];
    expect(orderJourneyStops(stops, []).map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("falls to nearest-track-vertex order when neither order nor time is present", () => {
    const track: OrderTrack = {
      geojson: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: [[0, 0], [1, 0], [2, 0]] },
          },
        ],
      },
    };
    const stops = [at(2, 0, { id: "far" }), at(0, 0, { id: "near" })];
    expect(orderJourneyStops(stops, [track]).map((s) => s.id)).toEqual([
      "near",
      "far",
    ]);
  });

  it("returns the input order when there is nothing to sort against", () => {
    const stops = [at(0, 0, { id: "x" }), at(1, 1, { id: "y" })];
    expect(orderJourneyStops(stops, []).map((s) => s.id)).toEqual(["x", "y"]);
  });

  it("does not mutate the input", () => {
    const stops = [at(0, 0, { order: 2 }), at(0, 0, { order: 1 })];
    orderJourneyStops(stops, []);
    expect(stops.map((s) => s.order)).toEqual([2, 1]);
  });
});
