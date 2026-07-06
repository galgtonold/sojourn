// Place photos on the map by matching their capture time to a timestamped GPX
// track point. Pure and DOM-free so it is fully unit-testable. All functions
// work in epoch-ms; a photo's true UTC = localMs - offset (known or detected).

export type TrackSample = { ms: number; lat: number; lng: number };

// A photo's stored capture time: the naive local wall-clock (Date.parse of the
// UTC-labelled `taken_at`) and its known UTC offset in minutes, or null.
export type PhotoTime = { localMs: number; offsetMin: number | null };

type Opts = { maxGapMs?: number; edgeToleranceMs?: number };

// Flatten track GeoJSON into time-sorted GPS samples, dropping points without a
// timestamp (properties.times[i] == null, or a track parsed before this feature
// shipped and thus carrying no times).
export function trackSamples(
  geojsons: Array<GeoJSON.FeatureCollection<GeoJSON.LineString> | null | undefined>,
): TrackSample[] {
  const out: TrackSample[] = [];
  for (const fc of geojsons) {
    for (const f of fc?.features ?? []) {
      const coords = f.geometry?.coordinates ?? [];
      const times = (f.properties as { times?: (number | null)[] } | null)?.times ?? [];
      for (let i = 0; i < coords.length; i++) {
        const ms = times[i];
        const c = coords[i];
        if (typeof ms === "number" && Number.isFinite(ms) && c) {
          out.push({ ms, lat: c[1], lng: c[0] });
        }
      }
    }
  }
  out.sort((a, b) => a.ms - b.ms);
  return out;
}

// Interpolate a position at UTC instant `utcMs`. Returns null when the instant
// is outside the sampled range (beyond edgeToleranceMs) or falls inside a
// bracketing gap longer than maxGapMs (don't guess a position across a long
// recording gap — e.g. a public-transport pause).
export function locateAtUtc(
  samples: TrackSample[],
  utcMs: number,
  opts: Opts = {},
): { lat: number; lng: number } | null {
  const maxGapMs = opts.maxGapMs ?? 10 * 60_000;
  const edge = opts.edgeToleranceMs ?? 2 * 60_000;
  if (samples.length === 0) return null;
  if (utcMs < samples[0].ms - edge) return null;
  if (utcMs > samples[samples.length - 1].ms + edge) return null;

  // First sample with ms >= utcMs.
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].ms < utcMs) lo = mid + 1;
    else hi = mid;
  }
  const hiS = samples[lo];
  if (hiS.ms === utcMs) return { lat: hiS.lat, lng: hiS.lng };
  if (lo === 0) return { lat: hiS.lat, lng: hiS.lng }; // within edge before first

  const loS = samples[lo - 1];
  const gap = hiS.ms - loS.ms;
  if (gap > maxGapMs) {
    if (utcMs - loS.ms <= edge) return { lat: loS.lat, lng: loS.lng };
    if (hiS.ms - utcMs <= edge) return { lat: hiS.lat, lng: hiS.lng };
    return null;
  }
  const f = (utcMs - loS.ms) / gap;
  return {
    lat: loS.lat + (hiS.lat - loS.lat) * f,
    lng: loS.lng + (hiS.lng - loS.lng) * f,
  };
}

function mode(xs: number[]): number {
  const counts = new Map<number, number>();
  let best = xs[0];
  let bestC = 0;
  for (const x of xs) {
    const c = (counts.get(x) ?? 0) + 1;
    counts.set(x, c);
    if (c > bestC) {
      bestC = c;
      best = x;
    }
  }
  return best;
}

// Choose the whole-hour offset (minutes) that lands the most offset-less photos
// inside the track's time span. Seeded toward offsets already seen on photos.
export function detectTripOffsetMin(
  photos: PhotoTime[],
  samples: TrackSample[],
): number {
  if (samples.length === 0) return 0;
  const lo = samples[0].ms;
  const hi = samples[samples.length - 1].ms;
  const unknown = photos.filter((p) => p.offsetMin == null);
  const known = photos
    .map((p) => p.offsetMin)
    .filter((o): o is number => o != null);

  let best = known.length ? mode(known) : 0;
  let bestIn = -1;
  for (let h = -12; h <= 14; h++) {
    const off = h * 60;
    let inRange = 0;
    for (const p of unknown) {
      const u = p.localMs - off * 60_000;
      if (u >= lo && u <= hi) inRange++;
    }
    const consistent = known.includes(off) && !known.includes(best);
    if (inRange > bestIn || (inRange === bestIn && consistent)) {
      bestIn = inRange;
      best = off;
    }
  }
  return best;
}

// Place each photo (aligned with `photos`): {lat,lng} when locatable, else null.
export function geotagPhotos(
  photos: PhotoTime[],
  samples: TrackSample[],
  opts?: Opts,
): Array<{ lat: number; lng: number } | null> {
  const fallback = detectTripOffsetMin(photos, samples);
  return photos.map((p) => {
    if (!Number.isFinite(p.localMs)) return null;
    const off = p.offsetMin ?? fallback;
    return locateAtUtc(samples, p.localMs - off * 60_000, opts);
  });
}
