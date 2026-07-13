// Pure, DOM-free: attribute each photo to the recorded track leg it was taken on,
// and how far along that leg — so the article generator (buildDossier) can place
// a photo on the right route instead of guessing from place-name overlap and
// ordering. Temporal-primary (tracks store per-point timestamps in the GeoJSON
// `properties.times`), spatial fallback for tracks without times / photos without
// a capture time. Reuses the geotag time primitives for the camera↔track clock
// offset, so the same detection that places photos on the map places them here.
import {
  trackSamples,
  detectTripOffsetMin,
  type PhotoTime,
} from "@/lib/geotag-from-track";

export type MatchTrack = {
  name: string | null;
  geojson: GeoJSON.FeatureCollection<GeoJSON.LineString> | null | undefined;
  distanceM?: number | null;
};

export type MatchPhoto = {
  id: string;
  takenAt: string | null; // UTC-labelled naive local wall clock (ISO)
  offsetMin?: number | null; // known UTC offset in minutes, or null to auto-detect
  lat?: number | null;
  lng?: number | null;
};

export type PhotoTrackMatch = {
  trackName: string | null;
  atKm: number; // cumulative distance along the leg at the photo
  totalKm: number; // the leg's total length
  via: "time" | "space";
};

// Mirror locateAtUtc's tolerances: don't interpolate a position across a long
// recording gap (a transit pause), and allow a small slack at the leg's edges.
const MAX_GAP_MS = 10 * 60_000;
const EDGE_MS = 2 * 60_000;
// A photo must be within this of the nearest track vertex to be attributed by
// space alone — tight enough that an off-route photo isn't force-fit onto a line.
const MAX_SPACE_M = 150;

function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

type ProfilePoint = { ms: number | null; lat: number; lng: number; cumM: number };
type Profile = {
  name: string | null;
  points: ProfilePoint[]; // all vertices, in track order, with cumulative distance
  timed: ProfilePoint[]; // subset carrying a timestamp, sorted by time
  totalM: number;
};

// Flatten a track's GeoJSON into vertices carrying cumulative along-line distance
// (and per-point time when present). Distance is accumulated in coordinate order,
// which is recording order.
function buildProfile(track: MatchTrack): Profile {
  const points: ProfilePoint[] = [];
  let cum = 0;
  let prev: GeoJSON.Position | null = null;
  for (const f of track.geojson?.features ?? []) {
    const coords = f.geometry?.coordinates ?? [];
    const times =
      (f.properties as { times?: (number | null)[] } | null)?.times ?? [];
    for (let i = 0; i < coords.length; i++) {
      const c = coords[i];
      if (!c || c.length < 2) continue;
      if (prev) cum += distanceM(prev[1], prev[0], c[1], c[0]);
      prev = c;
      const ms = times[i];
      points.push({
        ms: typeof ms === "number" && Number.isFinite(ms) ? ms : null,
        lat: c[1],
        lng: c[0],
        cumM: cum,
      });
    }
  }
  const timed = points.filter((p) => p.ms != null).sort((a, b) => a.ms! - b.ms!);
  // Prefer the stored distance for the "/ total" figure so it matches the Routen
  // block; fall back to the length we just walked.
  const totalM =
    track.distanceM != null && track.distanceM > 0 ? track.distanceM : cum;
  return { name: track.name, points, timed, totalM };
}

// Cumulative distance (m) at a UTC instant, interpolated between the bracketing
// timed samples. Null when the instant is outside the leg (beyond EDGE_MS) or
// lands inside a gap longer than MAX_GAP_MS.
function cumAtUtc(timed: ProfilePoint[], utcMs: number): number | null {
  if (timed.length === 0) return null;
  const first = timed[0];
  const last = timed[timed.length - 1];
  if (utcMs < first.ms! - EDGE_MS) return null;
  if (utcMs > last.ms! + EDGE_MS) return null;

  let lo = 0;
  let hi = timed.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (timed[mid].ms! < utcMs) lo = mid + 1;
    else hi = mid;
  }
  const hiS = timed[lo];
  if (hiS.ms === utcMs) return hiS.cumM;
  if (lo === 0) return hiS.cumM; // within edge before the first sample

  const loS = timed[lo - 1];
  const gap = hiS.ms! - loS.ms!;
  if (gap > MAX_GAP_MS) {
    if (utcMs - loS.ms! <= EDGE_MS) return loS.cumM;
    if (hiS.ms! - utcMs <= EDGE_MS) return hiS.cumM;
    return null;
  }
  const frac = (utcMs - loS.ms!) / gap;
  return loS.cumM + (hiS.cumM - loS.cumM) * frac;
}

function nearestVertex(
  points: ProfilePoint[],
  lat: number,
  lng: number,
): { cumM: number; distM: number } {
  let best = { cumM: 0, distM: Infinity };
  for (const p of points) {
    const d = distanceM(lat, lng, p.lat, p.lng);
    if (d < best.distM) best = { cumM: p.cumM, distM: d };
  }
  return best;
}

function result(prof: Profile, cumM: number, via: "time" | "space"): PhotoTrackMatch {
  return {
    trackName: prof.name,
    atKm: Math.max(0, Math.min(cumM, prof.totalM)) / 1000,
    totalKm: prof.totalM / 1000,
    via,
  };
}

// For each photo (aligned with `photos`): its track attribution, or null when no
// leg can be attributed confidently.
export function matchPhotosToTracks(
  photos: MatchPhoto[],
  tracks: MatchTrack[],
): (PhotoTrackMatch | null)[] {
  const profiles = tracks.map(buildProfile);

  // One offset for the whole set, detected the way map-placement does: the
  // whole-hour shift that lands the most undated-offset photos inside the tracks'
  // combined time span. Per-photo known offsets still win.
  const allSamples = trackSamples(tracks.map((t) => t.geojson ?? null));
  const photoTimes: PhotoTime[] = photos.map((p) => ({
    localMs: p.takenAt ? Date.parse(p.takenAt) : NaN,
    offsetMin: p.offsetMin ?? null,
  }));
  const fallbackOffset = detectTripOffsetMin(
    photoTimes.filter((pt) => Number.isFinite(pt.localMs)),
    allSamples,
  );

  return photos.map((p, i) => {
    // Temporal: pick the leg whose window most interiorly contains the instant.
    const localMs = photoTimes[i].localMs;
    if (Number.isFinite(localMs) && allSamples.length) {
      const off = p.offsetMin ?? fallbackOffset;
      const utc = localMs - off * 60_000;
      let best: { prof: Profile; cumM: number; interiority: number } | null = null;
      for (const prof of profiles) {
        if (prof.timed.length === 0) continue;
        const cum = cumAtUtc(prof.timed, utc);
        if (cum == null) continue;
        const first = prof.timed[0].ms!;
        const last = prof.timed[prof.timed.length - 1].ms!;
        const inside = utc >= first && utc <= last;
        // Higher is better: how deep inside the window (or, if only within edge
        // slack, how little outside it).
        const interiority = inside
          ? Math.min(utc - first, last - utc)
          : -Math.min(Math.abs(utc - first), Math.abs(utc - last));
        if (!best || interiority > best.interiority) best = { prof, cumM: cum, interiority };
      }
      if (best) return result(best.prof, best.cumM, "time");
    }

    // Spatial fallback: nearest vertex across all legs, if close enough.
    if (p.lat != null && p.lng != null) {
      let best: { prof: Profile; cumM: number; distM: number } | null = null;
      for (const prof of profiles) {
        if (prof.points.length === 0) continue;
        const n = nearestVertex(prof.points, p.lat, p.lng);
        if (!best || n.distM < best.distM) best = { prof, cumM: n.cumM, distM: n.distM };
      }
      if (best && best.distM <= MAX_SPACE_M) return result(best.prof, best.cumM, "space");
    }

    return null;
  });
}
