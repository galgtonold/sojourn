// Server-only reverse geocoding. Results are cached per-photo in the DB, so
// request volume stays well within the OpenStreetMap usage limits.
//
// A plain reverse-geocode snaps a GPS point to the most *specific* object there
// — inside a sculpture park that's a single artwork or a footpath, not the park
// — which is rarely the name a visitor would give the spot. So we also ask
// Overpass which named place the point sits *inside* (e.g. "Bruno Weber Park")
// and prefer that, keeping the region/country from Nominatim for context.
import "server-only";
import { env } from "@/lib/env";

type Parts = {
  place: string | null;
  region: string | null;
  country: string | null;
  display: string | null;
};

// Nominatim reverse geocode → coarse place + region + country.
async function nominatimReverse(lat: number, lng: number): Promise<Parts | null> {
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
    return {
      place,
      region: a.state || a.region || null,
      country: a.country || null,
      display: d.display_name ?? null,
    };
  } catch {
    return null;
  }
}

// The public Overpass endpoints are frequently overloaded (504 / multi-second
// queues) and then return an HTML error page, so we try a couple in turn.
const OVERPASS_ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

// Ask Overpass which named place the point lies *within*. is_in returns the
// enclosing areas (parks, attractions, reserves, plus admin boundaries we
// ignore); we keep the "visitable" named ones and pick the most landmark-like.
// Best effort: if no endpoint answers in time, the caller falls back to
// Nominatim's coarser result.
async function enclosingPlace(lat: number, lng: number): Promise<string | null> {
  type Tags = Record<string, string>;
  const query = `[out:json][timeout:20];is_in(${lat},${lng});out tags;`;
  let elements: { tags?: Tags }[] | null = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "User-Agent": `Sojourn/1.0 (${env.siteUrl})`,
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const ct = res.headers?.get?.("content-type");
      if (ct && !ct.includes("json")) continue; // overload pages are HTML
      elements = ((await res.json()).elements ?? []) as { tags?: Tags }[];
      break;
    } catch {
      // timeout / network / parse error → try the next endpoint
    }
  }
  if (!elements) return null;

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
  const candidates = elements
    .map((e) => e.tags ?? {})
    .filter(
      (t) =>
        t.name &&
        (t.tourism ||
          NOTABLE_LEISURE.includes(t.leisure) ||
          t.historic ||
          t.boundary === "national_park" ||
          t.boundary === "protected_area" ||
          NOTABLE_NATURAL.includes(t.natural)),
    );
  if (!candidates.length) return null;
  const rank = (t: Tags): number => {
    if (
      ["attraction", "museum", "theme_park", "zoo", "gallery", "aquarium"].includes(
        t.tourism,
      )
    )
      return 0;
    if (NOTABLE_LEISURE.includes(t.leisure)) return 1;
    if (t.boundary === "national_park" || t.boundary === "protected_area") return 2;
    if (t.historic) return 3;
    if (NOTABLE_NATURAL.includes(t.natural)) return 4;
    return 5; // tourism=viewpoint/artwork/picnic_site, …
  };
  candidates.sort((a, b) => rank(a) - rank(b));
  return candidates[0].name ?? null;
}

export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<string | null> {
  const [base, poi] = await Promise.all([
    nominatimReverse(lat, lng),
    enclosingPlace(lat, lng),
  ]);
  // The enclosing POI (if any) is the place a visitor would name; otherwise the
  // reverse-geocoded object. Region + country come from Nominatim for context.
  const place = poi ?? base?.place ?? null;
  const label = [place, base?.region, base?.country].filter(Boolean).join(", ");
  return label || base?.display || poi || null;
}
