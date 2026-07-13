// Server-only reverse geocoding. Results are cached per-photo in the DB, so
// request volume stays well within the providers' usage limits.
//
// A plain reverse-geocode snaps a GPS point to the most specific object there —
// inside a sculpture park that's a single artwork or a footpath, not the park,
// so a geotag yields a coarse/awkward name. We first ask Photon (a fast,
// reliable komoot-hosted OSM geocoder) for the nearby named features and pick
// the most landmark-like one (e.g. "Bruno Weber Park"); only if none is found
// do we fall back to Nominatim's coarser address.
import "server-only";
import { env } from "@/lib/env";

const NOTABLE_LEISURE = ["park", "garden", "nature_reserve", "common"];
const NOTABLE_NATURAL = [
  "peak",
  "volcano",
  "waterfall",
  "glacier",
  "bay",
  "beach",
  "cape",
  "cliff",
];

// Great-circle distance in metres.
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

type PhotonProps = {
  name?: string;
  osm_key?: string;
  osm_value?: string;
  city?: string;
  district?: string;
  county?: string;
  state?: string;
  country?: string;
};

// "Visitable" named feature one would name a spot by (parks, attractions,
// landmarks, notable nature), as opposed to roads, addresses, admin areas.
// Town squares and places of worship count too: they're exactly how you'd name
// a photo taken in a town centre ("Stortorget", "Kungsbacka kyrka"), and
// without them a centre-of-town geotag falls through to Nominatim, which can
// snap it to an obscure locality (see reverseGeocode / pickNominatimPlace).
function isVisitable(p: PhotonProps): boolean {
  const v = p.osm_value ?? "";
  return Boolean(
    p.name &&
      (p.osm_key === "tourism" ||
        (p.osm_key === "leisure" && NOTABLE_LEISURE.includes(v)) ||
        p.osm_key === "historic" ||
        (p.osm_key === "amenity" && v === "place_of_worship") ||
        (p.osm_key === "place" && v === "square") ||
        (p.osm_key === "boundary" &&
          (v === "national_park" || v === "protected_area")) ||
        (p.osm_key === "natural" && NOTABLE_NATURAL.includes(v))),
  );
}

function landmarkRank(p: PhotonProps): number {
  const v = p.osm_value ?? "";
  if (
    p.osm_key === "tourism" &&
    ["attraction", "museum", "theme_park", "zoo", "gallery", "aquarium"].includes(v)
  )
    return 0;
  if (p.osm_key === "leisure" && NOTABLE_LEISURE.includes(v)) return 1;
  if (p.osm_key === "boundary") return 2;
  if (p.osm_key === "historic") return 3;
  if (p.osm_key === "amenity" && v === "place_of_worship") return 3;
  if (p.osm_key === "natural") return 4;
  return 5; // place=square, tourism=artwork/viewpoint/picnic_site, …
}

export type PhotonFeature = {
  properties?: PhotonProps;
  geometry?: { coordinates?: number[] };
};

// Pure: visitable named features within 500 m of the point, ranked
// landmark-first then nearest. Shared by the single-best place snap and the
// candidate list handed to the vision model.
export function rankNearbyCandidates(
  features: PhotonFeature[],
  lat: number,
  lng: number,
): PhotonProps[] {
  const scored: { p: PhotonProps; dist: number }[] = [];
  for (const f of features) {
    const p = f.properties ?? {};
    const c = f.geometry?.coordinates; // [lon, lat]
    if (!isVisitable(p) || !c || c.length < 2) continue;
    const dist = distanceM(lat, lng, c[1], c[0]);
    if (dist > 500) continue;
    scored.push({ p, dist });
  }
  scored.sort((a, b) => landmarkRank(a.p) - landmarkRank(b.p) || a.dist - b.dist);
  return scored.map((s) => s.p);
}

// Photon: nearest named features → the most landmark-like one within ~500 m,
// labelled "<name>, <city/region>, <country>".
async function photonPlace(lat: number, lng: number): Promise<string | null> {
  try {
    const url =
      `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}` + `&lang=de&limit=25`;
    const res = await fetch(url, {
      headers: { "User-Agent": `Sojourn/1.0 (${env.siteUrl})` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const d = await res.json();
    const ranked = rankNearbyCandidates((d.features ?? []) as PhotonFeature[], lat, lng);
    const best = ranked[0];
    if (!best) return null;
    const region = best.city || best.district || best.county || best.state || null;
    return [best.name, region, best.country].filter(Boolean).join(", ") || null;
  } catch {
    return null;
  }
}

// Up to `limit` nearby landmark names (camera-vicinity), handed to the vision
// model so it can bind what it actually sees to the right name. Best effort.
export async function nearbyPlaces(
  lat: number,
  lng: number,
  limit = 4,
): Promise<string[]> {
  try {
    const url =
      `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}` + `&lang=de&limit=25`;
    const res = await fetch(url, {
      headers: { "User-Agent": `Sojourn/1.0 (${env.siteUrl})` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const d = await res.json();
    const names = rankNearbyCandidates((d.features ?? []) as PhotonFeature[], lat, lng)
      .map((p) => p.name)
      .filter((n): n is string => Boolean(n));
    return [...new Set(names)].slice(0, limit);
  } catch {
    return [];
  }
}

type NominatimAddress = {
  tourism?: string;
  attraction?: string;
  natural?: string;
  peak?: string;
  hamlet?: string;
  village?: string;
  town?: string;
  city?: string;
  municipality?: string;
  county?: string;
  state?: string;
  region?: string;
  country?: string;
  // Nominatim returns a variable set of address keys (farm, suburb, locality,
  // road, …); allow the rest without enumerating every one.
  [key: string]: string | undefined;
};

export type NominatimReverse = {
  name?: string;
  display_name?: string;
  address?: NominatimAddress;
};

// Pure: the most recognizable "<place>, <region>, <country>" label from a
// Nominatim reverse result. Leads with notable features (tourism/natural/peak)
// then the SETTLEMENT (hamlet→village→town→city); the snapped object's own
// `name` is only a last resort. That ordering matters: at neighbourhood zoom
// Nominatim can snap a town-centre point to an obscure farm/locality and expose
// it as `name` (e.g. "Yttrekolla", ~1.5 km from Kungsbacka's main square) — it
// must never outrank the actual town in the address hierarchy.
export function pickNominatimPlace(d: NominatimReverse): string | null {
  const a = d.address ?? {};
  const place =
    a.tourism ||
    a.attraction ||
    a.natural ||
    a.peak ||
    a.hamlet ||
    a.village ||
    a.town ||
    a.city ||
    a.municipality ||
    a.county ||
    d.name ||
    null;
  const label = [place, a.state || a.region || null, a.country || null]
    .filter(Boolean)
    .join(", ");
  return label || d.display_name || null;
}

// Nominatim reverse → coarse place + region + country (fallback only).
async function nominatimReverse(lat: number, lng: number): Promise<string | null> {
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2` +
      `&lat=${lat}&lon=${lng}&zoom=14&accept-language=de`;
    const res = await fetch(url, {
      headers: { "User-Agent": `Sojourn/1.0 (${env.siteUrl})` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return pickNominatimPlace((await res.json()) as NominatimReverse);
  } catch {
    return null;
  }
}

export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<string | null> {
  return (await photonPlace(lat, lng)) ?? (await nominatimReverse(lat, lng));
}

// Coarse "where is this" for a POST's location: the town/municipality, not the
// nearest landmark. A GPX start in Aschheim should read "Aschheim", not the mill
// 200 m away — so we skip Photon's landmark snapping and ask Nominatim at town
// zoom, taking the settlement (then county/state) rather than a point feature.
export async function reverseGeocodeArea(
  lat: number,
  lng: number,
): Promise<string | null> {
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2` +
      `&lat=${lat}&lon=${lng}&zoom=12&accept-language=de`;
    const res = await fetch(url, {
      headers: { "User-Agent": `Sojourn/1.0 (${env.siteUrl})` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const d = await res.json();
    const a = d.address ?? {};
    return (
      a.city ||
      a.town ||
      a.village ||
      a.municipality ||
      a.county ||
      a.state ||
      null
    );
  } catch {
    return null;
  }
}
