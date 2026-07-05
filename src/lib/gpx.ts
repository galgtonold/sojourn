// Parse GPX XML into a GeoJSON FeatureCollection of LineStrings (+ name and
// total distance). Browser-only — relies on DOMParser.

function haversine(a: number[], b: number[]): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function lineLength(coords: number[][]): number {
  let d = 0;
  for (let i = 1; i < coords.length; i++) d += haversine(coords[i - 1], coords[i]);
  return d;
}

export type ParsedGpx = {
  name: string | null;
  geojson: GeoJSON.FeatureCollection<GeoJSON.LineString>;
  distanceM: number;
  pointCount: number;
  // Earliest/latest trackpoint <time> (ISO), or null when the GPX has none.
  startedAt: string | null;
  endedAt: string | null;
};

// A single trackpoint: its [lon, lat(, ele)] coordinate and epoch-ms time (null
// when the GPX had no <time> for it).
export type GpxPoint = { coord: number[]; time: number | null };

// A jump between consecutive points counts as a "you paused and travelled"
// gap when it is both long enough in time and far enough in space. Without
// timestamps we fall back to distance alone.
export const MIN_GAP_MS = 600_000; // 10 minutes
export const MIN_GAP_M = 500;

// Split a point sequence wherever a transport-style gap appears, returning the
// contiguous runs between gaps. A walk → train → walk recording becomes two
// runs, so the train hop is never inside a run (and thus excluded from that
// run's distance). Pure and DOM-free so it can be unit-tested.
export function splitOnGaps(points: GpxPoint[]): GpxPoint[][] {
  const runs: GpxPoint[][] = [];
  let cur: GpxPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    if (i > 0) {
      const prev = points[i - 1];
      const p = points[i];
      const dist = haversine(prev.coord, p.coord);
      const isGap =
        prev.time != null && p.time != null
          ? p.time - prev.time > MIN_GAP_MS && dist > MIN_GAP_M
          : dist > MIN_GAP_M;
      if (isGap) {
        runs.push(cur);
        cur = [];
      }
    }
    cur.push(points[i]);
  }
  if (cur.length) runs.push(cur);
  return runs;
}

// Pull the track name and a flat, in-document-order point sequence out of a
// parsed GPX document. All <trkseg>s are concatenated, so segment boundaries
// become ordinary candidate split points for splitOnGaps.
function extractGpx(doc: Document): { name: string | null; points: GpxPoint[] } {
  const name =
    doc.querySelector("trk > name")?.textContent?.trim() ||
    doc.querySelector("metadata > name")?.textContent?.trim() ||
    doc.querySelector("rte > name")?.textContent?.trim() ||
    null;

  const points: GpxPoint[] = [];
  const collect = (segSelector: string, pointTag: string) => {
    doc.querySelectorAll(segSelector).forEach((seg) => {
      seg.querySelectorAll(pointTag).forEach((pt) => {
        const lon = parseFloat(pt.getAttribute("lon") || "");
        const lat = parseFloat(pt.getAttribute("lat") || "");
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
        const ele = parseFloat(pt.querySelector("ele")?.textContent || "");
        const coord = Number.isFinite(ele) ? [lon, lat, ele] : [lon, lat];
        const tm = Date.parse(pt.querySelector("time")?.textContent?.trim() || "");
        points.push({ coord, time: Number.isFinite(tm) ? tm : null });
      });
    });
  };

  collect("trkseg", "trkpt");
  if (points.length === 0) collect("rte", "rtept");
  return { name, points };
}

function runToParsed(name: string | null, run: GpxPoint[]): ParsedGpx {
  const coords = run.map((p) => p.coord);
  const times = run.flatMap((p) => (p.time == null ? [] : [p.time]));
  return {
    name,
    geojson: {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } },
      ],
    },
    distanceM: lineLength(coords),
    pointCount: coords.length,
    startedAt: times.length ? new Date(Math.min(...times)).toISOString() : null,
    endedAt: times.length ? new Date(Math.max(...times)).toISOString() : null,
  };
}

// Parse a GPX file and split it at transport gaps: returns one ParsedGpx per
// contiguous leg. A file with no gaps yields a single-element array. Runs of
// fewer than two points (e.g. a lone stray fix) are dropped. Browser-only —
// relies on DOMParser.
export function parseGpxSplit(xml: string): ParsedGpx[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("Invalid GPX file.");

  const { name, points } = extractGpx(doc);
  const runs = splitOnGaps(points).filter((r) => r.length > 1);
  if (runs.length === 0) throw new Error("No track points found in this GPX.");
  return runs.map((run) => runToParsed(name, run));
}

export function formatDistance(m: number | null | undefined): string {
  if (!m) return "";
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

// Decimate each LineString to at most `maxPoints` positions (uniform sampling,
// endpoints preserved) and drop elevation — full GPX resolution is invisible at
// the world-overview zoom of the global /map, so this shrinks that page's
// payload dramatically while the drawn line looks identical. Detail pages keep
// the full-resolution track.
export function simplifyLineStrings(
  fc: GeoJSON.FeatureCollection<GeoJSON.LineString>,
  maxPoints = 120,
): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  return {
    ...fc,
    features: (fc.features ?? []).map((f) => {
      const coords = f.geometry?.coordinates ?? [];
      const flat = ([lng, lat]: GeoJSON.Position): GeoJSON.Position => [lng, lat];
      if (coords.length <= maxPoints) {
        return { ...f, geometry: { ...f.geometry, coordinates: coords.map(flat) } };
      }
      const step = (coords.length - 1) / (maxPoints - 1);
      const out: GeoJSON.Position[] = [];
      for (let i = 0; i < maxPoints; i++) out.push(flat(coords[Math.round(i * step)]));
      out[out.length - 1] = flat(coords[coords.length - 1]);
      return { ...f, geometry: { ...f.geometry, coordinates: out } };
    }),
  };
}

export type ElevationSeries = {
  points: { d: number; e: number }[]; // cumulative distance (m), elevation (m)
  distanceM: number;
  ascent: number;
  descent: number;
  min: number;
  max: number;
};

// Builds a distance-vs-elevation series from a track's GeoJSON, or null if the
// track has no elevation data.
export function buildElevationSeries(
  geojson: GeoJSON.FeatureCollection<GeoJSON.LineString> | null | undefined,
): ElevationSeries | null {
  const coords: number[][] = [];
  for (const f of geojson?.features ?? []) {
    for (const c of f.geometry?.coordinates ?? []) coords.push(c);
  }
  if (coords.length < 2) return null;
  if (!coords.some((c) => c.length >= 3 && Number.isFinite(c[2]))) return null;

  let d = 0;
  let ascent = 0;
  let descent = 0;
  let min = Infinity;
  let max = -Infinity;
  let prevE: number | null = null;
  const points: { d: number; e: number }[] = [];

  for (let i = 0; i < coords.length; i++) {
    if (i > 0) d += haversine(coords[i - 1], coords[i]);
    const e = coords[i][2];
    if (!Number.isFinite(e)) continue;
    if (prevE != null) {
      const delta = e - prevE;
      if (delta > 0) ascent += delta;
      else descent -= delta;
    }
    prevE = e;
    min = Math.min(min, e);
    max = Math.max(max, e);
    points.push({ d, e });
  }

  return points.length >= 2
    ? { points, distanceM: d, ascent, descent, min, max }
    : null;
}
