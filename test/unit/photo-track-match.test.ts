import { describe, it, expect } from "vitest";
import { matchPhotosToTracks } from "@/lib/photo-track-match";

const t = (s: string) => Date.parse(s);

function leg(coords: number[][], times: (number | null)[]) {
  return {
    type: "Feature" as const,
    properties: { times },
    geometry: { type: "LineString" as const, coordinates: coords },
  };
}
function fc(features: ReturnType<typeof leg>[]) {
  return { type: "FeatureCollection" as const, features };
}

// A ~600 m bus hop 09:00–09:02, then a ~478 m walk 10:00–10:08 (5 points, 2 min
// apart) — two legs disjoint in time.
const bus = {
  name: "Busfahrt",
  geojson: fc([
    leg(
      [
        [12.05, 57.48],
        [12.06, 57.48],
      ],
      [t("2026-07-11T09:00:00Z"), t("2026-07-11T09:02:00Z")],
    ),
  ]),
  distanceM: null,
};
const hike = {
  name: "Wanderung",
  geojson: fc([
    leg(
      [
        [12.1, 57.49],
        [12.102, 57.49],
        [12.104, 57.49],
        [12.106, 57.49],
        [12.108, 57.49],
      ],
      [
        t("2026-07-11T10:00:00Z"),
        t("2026-07-11T10:02:00Z"),
        t("2026-07-11T10:04:00Z"),
        t("2026-07-11T10:06:00Z"),
        t("2026-07-11T10:08:00Z"),
      ],
    ),
  ]),
  distanceM: null,
};

describe("matchPhotosToTracks", () => {
  it("assigns each photo to the temporally-correct leg with a km marker", () => {
    const [onHike, onBus] = matchPhotosToTracks(
      [
        { id: "a", takenAt: "2026-07-11T10:03:00Z", offsetMin: 0, lat: 57.49, lng: 12.103 },
        { id: "b", takenAt: "2026-07-11T09:01:00Z", offsetMin: 0, lat: 57.48, lng: 12.055 },
      ],
      [bus, hike],
    );
    expect(onHike?.trackName).toBe("Wanderung");
    expect(onHike?.via).toBe("time");
    expect(onHike?.atKm).toBeCloseTo(0.179, 2); // interpolated halfway between 10:02 and 10:04
    expect(onHike?.totalKm).toBeCloseTo(0.478, 2);
    expect(onBus?.trackName).toBe("Busfahrt");
    expect(onBus?.atKm).toBeCloseTo(0.299, 2);
  });

  it("auto-detects the camera↔track clock offset (camera in +02:00, track UTC)", () => {
    // takenAt is naive local wall clock labelled Z; real UTC is 2 h earlier.
    const [m] = matchPhotosToTracks(
      [{ id: "a", takenAt: "2026-07-11T12:03:00Z", offsetMin: null, lat: 57.49, lng: 12.103 }],
      [hike],
    );
    expect(m?.trackName).toBe("Wanderung");
    expect(m?.via).toBe("time");
    expect(m?.atKm).toBeCloseTo(0.179, 2);
  });

  it("falls back to spatial matching when the track has no per-point times", () => {
    const coastal = {
      name: "Küstenweg",
      geojson: {
        type: "FeatureCollection" as const,
        features: [
          {
            type: "Feature" as const,
            properties: {},
            geometry: {
              type: "LineString" as const,
              coordinates: [
                [12.2, 57.6],
                [12.202, 57.6],
                [12.204, 57.6],
              ],
            },
          },
        ],
      },
      distanceM: null,
    };
    const [m] = matchPhotosToTracks(
      [{ id: "a", takenAt: null, lat: 57.6, lng: 12.202 }], // sitting on the middle vertex
      [coastal],
    );
    expect(m?.trackName).toBe("Küstenweg");
    expect(m?.via).toBe("space");
    expect(m?.atKm).toBeCloseTo(0.119, 2);
  });

  it("returns null for a photo far from every track and with no time", () => {
    const [m] = matchPhotosToTracks(
      [{ id: "a", takenAt: null, lat: 57.0, lng: 11.0 }],
      [hike],
    );
    expect(m).toBeNull();
  });

  it("returns null when a timed photo falls outside every track's window", () => {
    const [m] = matchPhotosToTracks(
      [{ id: "a", takenAt: "2026-07-11T18:00:00Z", offsetMin: 0, lat: 57.9, lng: 12.9 }],
      [hike],
    );
    expect(m).toBeNull();
  });
});
