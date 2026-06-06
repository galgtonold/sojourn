// Server-only reverse geocoding via OpenStreetMap Nominatim. Results are cached
// per-photo in the DB, so request volume stays well within usage limits.
import "server-only";
import { env } from "@/lib/env";

export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<string | null> {
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2` +
      `&lat=${lat}&lon=${lng}&zoom=13&accept-language=de`;
    const res = await fetch(url, {
      headers: { "User-Agent": `Sojourn/1.0 (${env.siteUrl})` },
      // Nominatim is slow-ish; don't let it hang a request forever.
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const d = await res.json();
    const a = d.address ?? {};
    const place =
      d.name ||
      a.tourism ||
      a.natural ||
      a.peak ||
      a.attraction ||
      a.hamlet ||
      a.village ||
      a.town ||
      a.city ||
      a.municipality ||
      a.county ||
      null;
    const region = a.state || a.region || null;
    const country = a.country || null;
    const label = [place, region, country].filter(Boolean).join(", ");
    return label || d.display_name || null;
  } catch {
    return null;
  }
}
