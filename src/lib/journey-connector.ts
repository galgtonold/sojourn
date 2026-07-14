// Builds the dashed "connector" the journey map draws between recorded GPX
// tracks. The solid track lines already show where the route was recorded, so
// the dashed line should only bridge the GAPS — never retrace a track, and
// never hang off a photo that was taken while a track was being recorded.
//
// Algorithm: lay every recorded thing on a timeline as anchors —
//   - each timed track contributes a start anchor (its first point) and an end
//     anchor (its last point);
//   - each photo taken OUTSIDE every track's [started_at, ended_at] span
//     contributes an anchor at its location; photos inside a span are already
//     covered by that track's solid line, so they're dropped.
// Sort the anchors chronologically and connect each consecutive pair, except a
// track's own start→end (that's the solid line). What remains are exactly the
// bridges: track→track, track→photo, photo→track and photo→photo across a gap.

export type ConnectorTrack = {
  startedAt?: string | null;
  endedAt?: string | null;
  coords: number[][]; // [lng, lat][] in recorded order
};

export type ConnectorPhoto = {
  takenAt?: string | null;
  lng: number;
  lat: number;
};

type Anchor = {
  t: number;
  coord: number[];
  track?: number; // index of the owning track, for start/end anchors
  role?: "start" | "end";
};

// Returns a list of 2-point segments ([from, to]) to draw as dashed lines.
// With `clampPhotosToTrackWindow`, photos taken outside the recorded tracks'
// overall time span are ignored — otherwise a photo from another day (or long
// after you stopped recording) anchors at the far end of the timeline and gets
// bridged to a track with one long, nonsensical line.
export function buildConnectorSegments(
  tracks: ConnectorTrack[],
  photos: ConnectorPhoto[],
  options: { clampPhotosToTrackWindow?: boolean } = {},
): number[][][] {
  const anchors: Anchor[] = [];
  const spans: { s: number; e: number }[] = [];

  tracks.forEach((tr, ti) => {
    const s = tr.startedAt ? Date.parse(tr.startedAt) : NaN;
    const e = tr.endedAt ? Date.parse(tr.endedAt) : NaN;
    if (!Number.isFinite(s) || !Number.isFinite(e) || tr.coords.length === 0)
      return;
    spans.push({ s, e });
    anchors.push({ t: s, coord: tr.coords[0], track: ti, role: "start" });
    anchors.push({
      t: e,
      coord: tr.coords[tr.coords.length - 1],
      track: ti,
      role: "end",
    });
  });

  // The window the recorded tracks span (only meaningful when at least one
  // timed track exists — otherwise the clamp is a no-op and photos chain freely).
  const winStart = spans.length ? Math.min(...spans.map((sp) => sp.s)) : -Infinity;
  const winEnd = spans.length ? Math.max(...spans.map((sp) => sp.e)) : Infinity;

  for (const ph of photos) {
    const t = ph.takenAt ? Date.parse(ph.takenAt) : NaN;
    if (!Number.isFinite(t)) continue;
    if (options.clampPhotosToTrackWindow && (t < winStart || t > winEnd))
      continue; // outside the journey's recorded window — not a waypoint
    if (spans.some((sp) => t >= sp.s && t <= sp.e)) continue; // covered already
    anchors.push({ t, coord: [ph.lng, ph.lat] });
  }

  // Stable chronological order; ties keep a track's start before its end.
  anchors.sort((a, b) => a.t - b.t || roleRank(a) - roleRank(b));

  const segments: number[][][] = [];
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    // A track's own span is drawn by its solid line — don't retrace it.
    if (
      a.track != null &&
      a.track === b.track &&
      a.role === "start" &&
      b.role === "end"
    )
      continue;
    // Skip zero-length bridges (tracks that meet exactly).
    if (a.coord[0] === b.coord[0] && a.coord[1] === b.coord[1]) continue;
    segments.push([a.coord, b.coord]);
  }
  return segments;
}

function roleRank(a: Anchor): number {
  return a.role === "start" ? 0 : a.role === "end" ? 1 : 0;
}

// Great-circle distance (m) between two [lng, lat] points.
function haversine(a: number[], b: number[]): number {
  const R = 6371000;
  const r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(b[1] - a[1]);
  const dLon = r(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(r(a[1])) * Math.cos(r(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type OrderableStop = {
  order?: number | null; // the author's chosen sequence (posts × sort_order)
  takenAt?: string | null;
  lat: number;
  lng: number;
};

export type OrderTrack = {
  geojson?: GeoJSON.FeatureCollection<GeoJSON.LineString> | null;
};

/**
 * Order journey stops so "next" walks the journey in sequence, in three
 * precedence tiers: (1) the explicit author `order` when EVERY stop has one
 * (authoritative); else (2) chronological by capture time when every stop is
 * timed; else (3) spatial — by each stop's nearest recorded track vertex. Falls
 * back to the input order when there are no coordinates to sort against. Pure,
 * generic (returns the same stop type), never mutates the input.
 */
export function orderJourneyStops<S extends OrderableStop>(
  stops: S[],
  tracks: OrderTrack[],
): S[] {
  if (stops.length > 0 && stops.every((s) => s.order != null)) {
    return [...stops].sort((a, b) => (a.order as number) - (b.order as number));
  }
  if (
    stops.length > 0 &&
    stops.every((s) => s.takenAt && Number.isFinite(Date.parse(s.takenAt)))
  ) {
    return [...stops].sort(
      (a, b) => Date.parse(a.takenAt as string) - Date.parse(b.takenAt as string),
    );
  }
  const coords: number[][] = [];
  for (const tr of tracks)
    for (const f of tr.geojson?.features ?? [])
      for (const c of f.geometry?.coordinates ?? []) coords.push(c);
  if (coords.length === 0) return stops;
  const nearestIndex = (s: S) => {
    let best = Infinity;
    let bestI = 0;
    for (let i = 0; i < coords.length; i++) {
      const d = haversine([s.lng, s.lat], coords[i]);
      if (d < best) {
        best = d;
        bestI = i;
      }
    }
    return bestI;
  };
  return [...stops].sort((a, b) => nearestIndex(a) - nearestIndex(b));
}
