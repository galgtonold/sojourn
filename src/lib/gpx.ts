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

export function runToParsed(name: string | null, run: GpxPoint[]): ParsedGpx {
  const coords = run.map((p) => p.coord);
  const times = run.flatMap((p) => (p.time == null ? [] : [p.time]));
  return {
    name,
    geojson: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { times: run.map((p) => p.time) },
          geometry: { type: "LineString", coordinates: coords },
        },
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

// Collapse the split legs of one GPX back into a single continuous track: every
// leg's coordinates concatenated into one LineString (bridging the gaps), the
// distance recomputed over that line, and the widest time window. Used when the
// author chooses "keep as one" on import. ISO timestamps compare lexicographically
// (all runToParsed output is `…Z`), so string min/max is chronological.
export function mergeLegs(legs: ParsedGpx[]): ParsedGpx {
  const coords = legs.flatMap((l) =>
    l.geojson.features.flatMap((f) => f.geometry.coordinates),
  );
  const starts = legs
    .map((l) => l.startedAt)
    .filter((s): s is string => s != null);
  const ends = legs.map((l) => l.endedAt).filter((s): s is string => s != null);
  return {
    name: legs[0]?.name ?? null,
    geojson: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: coords },
        },
      ],
    },
    distanceM: lineLength(coords),
    pointCount: coords.length,
    startedAt: starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : null,
    endedAt: ends.length ? ends.reduce((a, b) => (a > b ? a : b)) : null,
  };
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
        return { ...f, properties: {}, geometry: { ...f.geometry, coordinates: coords.map(flat) } };
      }
      const step = (coords.length - 1) / (maxPoints - 1);
      const out: GeoJSON.Position[] = [];
      for (let i = 0; i < maxPoints; i++) out.push(flat(coords[Math.round(i * step)]));
      out[out.length - 1] = flat(coords[coords.length - 1]);
      return { ...f, properties: {}, geometry: { ...f.geometry, coordinates: out } };
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

// Phone GPS/barometer altitude is noisy — single samples can be tens of metres
// off, so summing raw deltas reports absurd climb (e.g. 2000 m of "ascent" up a
// 90 m hill) and draws a jagged line. These constants tame that without
// flattening real terrain, which spans many samples.
// A Hampel filter first rejects gross outliers — GPS/barometer dropouts that
// jump tens of metres between adjacent samples — replacing any point that sits
// more than K MADs from its local median. Then a median + short mean smooth the
// rest. Gain is accumulated with a small deadband. The deadband stays small on
// purpose: a large one silently erases real rolling terrain (a run of 20 m hills
// would vanish), so outlier rejection, not the deadband, does the heavy lifting.
const EL_HAMPEL_WINDOW = 21;
const EL_HAMPEL_K = 1.5;
const EL_MEDIAN_WINDOW = 9; // rejects residual spikes/short dropouts
const EL_MEAN_WINDOW = 5; // smooths residual jitter into a readable line
const EL_GAIN_DEADBAND_M = 3; // ignore sub-threshold wobble in ascent/descent
// Below this, a smoothing window would average most of the series and flatten
// real terrain, so short tracks are left raw (the deadband still filters noise).
const EL_SMOOTH_MIN_POINTS = 12;

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[s.length >> 1];
}

function movingMedian(values: number[], window: number): number[] {
  if (window <= 1 || values.length < window) return values.slice();
  const half = Math.floor(window / 2);
  return values.map((_, i) =>
    median(values.slice(Math.max(0, i - half), Math.min(values.length, i + half + 1))),
  );
}

// Replace points that deviate more than `k` scaled-MADs from their local median
// with that median — a robust despiker that leaves the rest of the signal (and
// real terrain) untouched. The MAD is floored so a flat, low-noise stretch
// doesn't flag every tiny wobble as an outlier.
function hampelFilter(values: number[], window: number, k: number): number[] {
  if (window <= 1 || values.length < window) return values.slice();
  const half = Math.floor(window / 2);
  return values.map((x, i) => {
    const win = values.slice(
      Math.max(0, i - half),
      Math.min(values.length, i + half + 1),
    );
    const m = median(win);
    const mad = median(win.map((v) => Math.abs(v - m))) * 1.4826;
    return Math.abs(x - m) > k * Math.max(mad, 0.8) ? m : x;
  });
}

function movingAverage(values: number[], window: number): number[] {
  if (window <= 1) return values.slice();
  const half = Math.floor(window / 2);
  return values.map((_, i) => {
    let sum = 0;
    let n = 0;
    for (
      let j = Math.max(0, i - half);
      j < Math.min(values.length, i + half + 1);
      j++
    ) {
      sum += values[j];
      n++;
    }
    return sum / n;
  });
}

// Median filter (spike removal) followed by a short moving average (jitter
// smoothing). Exported for testing.
export function smoothElevations(eles: number[]): number[] {
  if (eles.length < EL_SMOOTH_MIN_POINTS) return eles.slice();
  const despiked = hampelFilter(eles, EL_HAMPEL_WINDOW, EL_HAMPEL_K);
  return movingAverage(movingMedian(despiked, EL_MEDIAN_WINDOW), EL_MEAN_WINDOW);
}

// Builds a distance-vs-elevation series from a track's GeoJSON, or null if the
// track has no elevation data. The elevation profile is smoothed and ascent/
// descent are accumulated with a deadband, so noisy phone data reads sensibly.
export function buildElevationSeries(
  geojson: GeoJSON.FeatureCollection<GeoJSON.LineString> | null | undefined,
): ElevationSeries | null {
  const coords: number[][] = [];
  for (const f of geojson?.features ?? []) {
    for (const c of f.geometry?.coordinates ?? []) coords.push(c);
  }
  if (coords.length < 2) return null;
  if (!coords.some((c) => c.length >= 3 && Number.isFinite(c[2]))) return null;

  // Cumulative distance across the whole line; keep (distance, raw elevation)
  // for every point that carries an elevation.
  let total = 0;
  const raw: { d: number; e: number }[] = [];
  for (let i = 0; i < coords.length; i++) {
    if (i > 0) total += haversine(coords[i - 1], coords[i]);
    const e = coords[i][2];
    if (Number.isFinite(e)) raw.push({ d: total, e });
  }
  if (raw.length < 2) return null;

  const smoothed = smoothElevations(raw.map((p) => p.e));
  const points = raw.map((p, i) => ({ d: p.d, e: smoothed[i] }));

  // Accumulate gain/loss with a deadband (hysteresis): only a move of more than
  // EL_GAIN_DEADBAND_M past the last committed point counts, so residual wobble
  // can't inflate the totals.
  let ascent = 0;
  let descent = 0;
  let ref = smoothed[0];
  let min = smoothed[0];
  let max = smoothed[0];
  for (let i = 1; i < smoothed.length; i++) {
    const e = smoothed[i];
    if (e - ref > EL_GAIN_DEADBAND_M) {
      ascent += e - ref;
      ref = e;
    } else if (ref - e > EL_GAIN_DEADBAND_M) {
      descent += ref - e;
      ref = e;
    }
    if (e < min) min = e;
    if (e > max) max = e;
  }

  return { points, distanceM: total, ascent, descent, min, max };
}
