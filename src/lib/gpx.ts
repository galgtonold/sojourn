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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  geojson: { type: "FeatureCollection"; features: any[] };
  distanceM: number;
  pointCount: number;
};

export function parseGpx(xml: string): ParsedGpx {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("Invalid GPX file.");

  const name =
    doc.querySelector("trk > name")?.textContent?.trim() ||
    doc.querySelector("metadata > name")?.textContent?.trim() ||
    doc.querySelector("rte > name")?.textContent?.trim() ||
    null;

  const lines: number[][][] = [];
  const collect = (segSelector: string, pointTag: string) => {
    doc.querySelectorAll(segSelector).forEach((seg) => {
      const coords: number[][] = [];
      seg.querySelectorAll(pointTag).forEach((pt) => {
        const lon = parseFloat(pt.getAttribute("lon") || "");
        const lat = parseFloat(pt.getAttribute("lat") || "");
        if (Number.isFinite(lat) && Number.isFinite(lon)) coords.push([lon, lat]);
      });
      if (coords.length > 1) lines.push(coords);
    });
  };

  collect("trkseg", "trkpt");
  if (lines.length === 0) collect("rte", "rtept");
  if (lines.length === 0) throw new Error("No track points found in this GPX.");

  const features = lines.map((coords) => ({
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates: coords },
  }));

  return {
    name,
    geojson: { type: "FeatureCollection", features },
    distanceM: lines.reduce((s, c) => s + lineLength(c), 0),
    pointCount: lines.reduce((s, c) => s + c.length, 0),
  };
}

export function formatDistance(m: number | null | undefined): string {
  if (!m) return "";
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}
