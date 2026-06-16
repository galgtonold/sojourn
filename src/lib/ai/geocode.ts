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
function isVisitable(p: PhotonProps): boolean {
  const v = p.osm_value ?? "";
  return Boolean(
    p.name &&
      (p.osm_key === "tourism" ||
        (p.osm_key === "leisure" && NOTABLE_LEISURE.includes(v)) ||
        p.osm_key === "historic" ||
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
  if (p.osm_key === "natural") return 4;
  return 5; // tourism=artwork/viewpoint/picnic_site, …
}

// Photon: nearest named features → the most landmark-like one within ~500 m,
// labelled "<name>, <city/region>, <country>".
async function photonPlace(lat: number, lng: number): Promise<string | null> {
  try {
    const url =
      `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}` +
      `&lang=de&limit=25`;
    const res = await fetch(url, {
      headers: { "User-Agent": `Sojourn/1.0 (${env.siteUrl})` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const d = await res.json();
    type Feat = { properties?: PhotonProps; geometry?: { coordinates?: number[] } };
    const candidates: { p: PhotonProps; dist: number }[] = [];
    for (const f of (d.features ?? []) as Feat[]) {
      const p = f.properties ?? {};
      const c = f.geometry?.coordinates; // [lon, lat]
      if (!isVisitable(p) || !c || c.length < 2) continue;
      const dist = distanceM(lat, lng, c[1], c[0]);
      if (dist > 500) continue;
      candidates.push({ p, dist });
    }
    if (!candidates.length) return null;
    candidates.sort(
      (a, b) => landmarkRank(a.p) - landmarkRank(b.p) || a.dist - b.dist,
    );
    const best = candidates[0].p;
    const region = best.city || best.district || best.county || best.state || null;
    return [best.name, region, best.country].filter(Boolean).join(", ") || null;
  } catch {
    return null;
  }
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
    const d = await res.json();
    const a = d.address ?? {};
    const place =
      d.name ||
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
      null;
    const label = [place, a.state || a.region || null, a.country || null]
      .filter(Boolean)
      .join(", ");
    return label || d.display_name || null;
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
