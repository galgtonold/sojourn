import type { Track } from "@/lib/types";

// One source and one layer for every GPX track on a map, instead of one each.
//
// MapLibre walks its layer list every frame, so a layer per track turns a long
// archive into a slideshow: at 25 voyages that is ~1,100 sources, ~1,100 layers
// and ~3,300 event handlers, all created during `load`. Merged into a single
// FeatureCollection it stays one source, one layer and one handler no matter
// how many journeys accumulate — and the per-track name simply rides along on
// each feature, so clicking a route still names it.

export const TRACKS_SOURCE = "tracks-all";
export const TRACKS_LAYER = "tracks-all";

type LineFeature = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: { type: "LineString"; coordinates: number[][] };
};

export type TrackFeatureCollection = {
  type: "FeatureCollection";
  features: LineFeature[];
};

/**
 * Flatten tracks into one FeatureCollection, tagging every line with the name
 * of the track it came from so a click can report it.
 */
export function trackFeatureCollection(
  tracks: Track[] | null | undefined,
  fallbackName: string,
): TrackFeatureCollection {
  const features: LineFeature[] = [];
  for (const track of tracks ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parts = (track?.geojson as any)?.features;
    if (!Array.isArray(parts)) continue;
    for (const f of parts) {
      if (f?.geometry?.type !== "LineString" || !Array.isArray(f.geometry.coordinates)) {
        continue;
      }
      features.push({
        type: "Feature",
        properties: {
          ...(f.properties ?? {}),
          name: track.name ?? fallbackName,
        },
        geometry: f.geometry,
      });
    }
  }
  return { type: "FeatureCollection", features };
}

/**
 * The slice of MapLibre's Map this needs, kept structural so a test can hand it
 * a plain object and assert exactly what the browser would have been asked to
 * do. `any` at this seam only: MapLibre's own SourceSpecification/LayerSpecification
 * unions won't unify with a narrower shape in either direction.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export type TrackLayerMap = {
  addSource(id: string, source: any): any;
  addLayer(layer: any): any;
  on(event: any, layerId: any, handler: (e: any) => void): any;
  getSource?(id: string): any;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

export type MapClick = {
  lngLat: unknown;
  features?: { properties?: Record<string, unknown> | null }[];
};

export type AddTracksOptions = {
  /** Name reported for a track that has none. */
  fallbackName: string;
  width: number;
  opacity: number;
  /** Wire click + hover. Omit on maps whose routes aren't clickable. */
  onRouteClick?: (name: string, e: MapClick) => void;
  /** Called on hover in/out so the caller can set its own cursor. */
  onHover?: (over: boolean) => void;
};

/**
 * Put every track on the map as a single source and layer.
 *
 * Returns the number of lines drawn (0 when there is nothing to draw, in which
 * case no source, layer or handler is created at all).
 */
export function addTracksLayer(
  map: TrackLayerMap,
  tracks: Track[] | null | undefined,
  opts: AddTracksOptions,
): number {
  const data = trackFeatureCollection(tracks, opts.fallbackName);
  if (data.features.length === 0) return 0;
  if (map.getSource?.(TRACKS_SOURCE)) return 0;

  map.addSource(TRACKS_SOURCE, { type: "geojson", data });
  map.addLayer({
    id: TRACKS_LAYER,
    type: "line",
    source: TRACKS_SOURCE,
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-color": "#f56a1f",
      "line-width": opts.width,
      "line-opacity": opts.opacity,
    },
  });

  if (opts.onRouteClick) {
    const click = opts.onRouteClick;
    map.on("click", TRACKS_LAYER, (e) => {
      const name = e.features?.[0]?.properties?.name;
      click(typeof name === "string" && name ? name : opts.fallbackName, e);
    });
  }
  if (opts.onHover) {
    const hover = opts.onHover;
    map.on("mouseenter", TRACKS_LAYER, () => hover(true));
    map.on("mouseleave", TRACKS_LAYER, () => hover(false));
  }
  return data.features.length;
}
