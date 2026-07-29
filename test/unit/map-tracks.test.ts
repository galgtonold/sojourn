import { describe, it, expect, vi } from "vitest";
import {
  trackFeatureCollection,
  addTracksLayer,
  TRACKS_SOURCE,
  TRACKS_LAYER,
  type MapClick,
} from "@/lib/map-tracks";
import type { Track } from "@/lib/types";

const line = (coordinates: number[][], properties: Record<string, unknown> = {}) => ({
  type: "Feature",
  properties,
  geometry: { type: "LineString", coordinates },
});

const track = (name: string | null, features: unknown[]): Track =>
  ({
    id: name ?? "t",
    name,
    distance_m: 1,
    started_at: null,
    ended_at: null,
    geojson: { type: "FeatureCollection", features },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

describe("trackFeatureCollection", () => {
  it("merges every track into one collection", () => {
    const fc = trackFeatureCollection(
      [
        track("day one", [line([[0, 0], [1, 1]])]),
        track("day two", [line([[2, 2], [3, 3]]), line([[4, 4], [5, 5]])]),
      ],
      "route",
    );
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toHaveLength(3);
  });

  it("carries each track's name onto its lines, so one handler can name them", () => {
    const fc = trackFeatureCollection(
      [track("day one", [line([[0, 0], [1, 1]])]), track("day two", [line([[2, 2], [3, 3]])])],
      "route",
    );
    expect(fc.features.map((f) => f.properties.name)).toEqual(["day one", "day two"]);
  });

  it("falls back when a track is unnamed", () => {
    const fc = trackFeatureCollection([track(null, [line([[0, 0], [1, 1]])])], "Route");
    expect(fc.features[0].properties.name).toBe("Route");
  });

  it("keeps existing feature properties", () => {
    const fc = trackFeatureCollection(
      [track("day one", [line([[0, 0], [1, 1]], { surface: "gravel" })])],
      "route",
    );
    expect(fc.features[0].properties).toMatchObject({ surface: "gravel", name: "day one" });
  });

  it("preserves the geometry untouched", () => {
    const coords = [[0, 0], [1, 1], [2, 2]];
    const fc = trackFeatureCollection([track("day one", [line(coords)])], "route");
    expect(fc.features[0].geometry.coordinates).toEqual(coords);
  });

  it("skips anything that isn't a drawable line", () => {
    const fc = trackFeatureCollection(
      [
        track("mixed", [
          { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [1, 2] } },
          line([[0, 0], [1, 1]]),
        ]),
      ],
      "route",
    );
    expect(fc.features).toHaveLength(1);
  });

  it("survives tracks with no usable geojson", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const broken = [{ name: "x", geojson: null } as any];
    expect(trackFeatureCollection(broken, "route").features).toEqual([]);
  });

  it("handles absent input", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const broken = [{ name: "x", geojson: null } as any, { name: "y" } as any];
    expect(trackFeatureCollection(broken, "route").features).toEqual([]);
    expect(trackFeatureCollection(null, "route").features).toEqual([]);
    expect(trackFeatureCollection([], "route").features).toEqual([]);
  });
});

/** Records exactly what a MapLibre map would have been asked to do. */
function fakeMap() {
  const calls = {
    sources: [] as [string, unknown][],
    layers: [] as Record<string, unknown>[],
    handlers: [] as [string, string][],
  };
  const map = {
    addSource: (id: string, s: unknown) => void calls.sources.push([id, s]),
    addLayer: (l: Record<string, unknown>) => void calls.layers.push(l),
    on: (ev: string, layer: string, h: (e: MapClick) => void) => {
      calls.handlers.push([ev, layer]);
      (calls as Record<string, unknown>)[`${ev}Handler`] = h;
    },
    getSource: () => undefined,
  };
  return { map, calls };
}

describe("addTracksLayer — the wiring the browser would do", () => {
  const many = Array.from({ length: 200 }, (_, i) =>
    track(`stage ${i}`, [line([[i, 0], [i + 1, 1]])]),
  );

  it("creates exactly one source and one layer for 200 tracks", () => {
    const { map, calls } = fakeMap();
    const drawn = addTracksLayer(map, many, {
      fallbackName: "Route",
      width: 4,
      opacity: 0.9,
    });
    expect(drawn).toBe(200);
    expect(calls.sources).toHaveLength(1);
    expect(calls.layers).toHaveLength(1);
    expect(calls.sources[0][0]).toBe(TRACKS_SOURCE);
    expect(calls.layers[0].id).toBe(TRACKS_LAYER);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((calls.sources[0][1] as any).data.features).toHaveLength(200);
  });

  it("registers three handlers in total, not three per track", () => {
    const { map, calls } = fakeMap();
    addTracksLayer(map, many, {
      fallbackName: "Route",
      width: 4,
      opacity: 0.9,
      onRouteClick: () => {},
      onHover: () => {},
    });
    expect(calls.handlers).toEqual([
      ["click", TRACKS_LAYER],
      ["mouseenter", TRACKS_LAYER],
      ["mouseleave", TRACKS_LAYER],
    ]);
  });

  it("reports the clicked route's own name", () => {
    const { map, calls } = fakeMap();
    const onRouteClick = vi.fn();
    addTracksLayer(map, many, { fallbackName: "Route", width: 4, opacity: 0.9, onRouteClick });
    const handler = (calls as unknown as Record<string, (e: MapClick) => void>)
      .clickHandler;
    handler({ lngLat: {}, features: [{ properties: { name: "stage 7" } }] });
    expect(onRouteClick).toHaveBeenCalledWith("stage 7", expect.anything());
  });

  it("falls back when the clicked feature carries no name", () => {
    const { map, calls } = fakeMap();
    const onRouteClick = vi.fn();
    addTracksLayer(map, many, { fallbackName: "Route", width: 4, opacity: 0.9, onRouteClick });
    const handler = (calls as unknown as Record<string, (e: MapClick) => void>)
      .clickHandler;
    handler({ lngLat: {}, features: [{ properties: {} }] });
    expect(onRouteClick).toHaveBeenCalledWith("Route", expect.anything());
  });

  it("draws nothing at all when there are no tracks", () => {
    const { map, calls } = fakeMap();
    expect(addTracksLayer(map, [], { fallbackName: "Route", width: 4, opacity: 0.9 })).toBe(0);
    expect(calls.sources).toHaveLength(0);
    expect(calls.layers).toHaveLength(0);
    expect(calls.handlers).toHaveLength(0);
  });

  it("carries the caller's paint through", () => {
    const { map, calls } = fakeMap();
    addTracksLayer(map, many, { fallbackName: "Route", width: 3, opacity: 0.6 });
    expect(calls.layers[0].paint).toMatchObject({
      "line-width": 3,
      "line-opacity": 0.6,
    });
  });
});
