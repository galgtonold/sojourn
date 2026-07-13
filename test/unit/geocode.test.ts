import { describe, it, expect, vi, afterEach } from "vitest";
import {
  reverseGeocode,
  rankNearbyCandidates,
  pickNominatimPlace,
} from "@/lib/ai/geocode";

function mockFetch(impl: () => unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => impl()));
}

describe("reverseGeocode", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("builds a place, region, country label", async () => {
    mockFetch(() => ({
      ok: true,
      json: async () => ({
        address: { peak: "Jungfrau", state: "Bern", country: "Schweiz" },
      }),
    }));
    expect(await reverseGeocode(46.5, 8)).toBe("Jungfrau, Bern, Schweiz");
  });

  it("falls back to display_name when no structured place is found", async () => {
    mockFetch(() => ({
      ok: true,
      json: async () => ({ address: {}, display_name: "Somewhere remote" }),
    }));
    expect(await reverseGeocode(0, 0)).toBe("Somewhere remote");
  });

  it("returns null on a non-OK response", async () => {
    mockFetch(() => ({ ok: false, status: 500 }));
    expect(await reverseGeocode(0, 0)).toBeNull();
  });

  it("returns null when the request throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network");
    }));
    expect(await reverseGeocode(0, 0)).toBeNull();
  });

  it("prefers a nearby landmark (Photon) over the snapped object", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("photon")) {
          return {
            ok: true,
            json: async () => ({
              features: [
                {
                  properties: {
                    name: "Theaterplatz",
                    osm_key: "tourism",
                    osm_value: "artwork",
                    city: "Dietikon",
                    country: "Schweiz",
                  },
                  geometry: { coordinates: [8.38158, 47.40508] },
                },
                {
                  properties: {
                    name: "Bruno Weber Park",
                    osm_key: "tourism",
                    osm_value: "museum",
                    city: "Dietikon",
                    country: "Schweiz",
                  },
                  geometry: { coordinates: [8.38102, 47.40517] },
                },
              ],
            }),
          };
        }
        return { ok: false }; // Nominatim shouldn't be needed
      }),
    );
    // The museum (rank 0) beats the artwork (rank 5), both within range.
    expect(await reverseGeocode(47.404978, 8.381622)).toBe(
      "Bruno Weber Park, Dietikon, Schweiz",
    );
  });

  it("ignores a far-away landmark and falls back to the reverse-geocoded place", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("photon")) {
          return {
            ok: true,
            json: async () => ({
              features: [
                {
                  // ~5 km away → beyond the 500 m radius, so it's dropped.
                  properties: {
                    name: "Fernes Schloss",
                    osm_key: "historic",
                    osm_value: "castle",
                    country: "Schweden",
                  },
                  geometry: { coordinates: [14.06, 58.84] },
                },
              ],
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            address: { village: "Sjötorp", state: "Västra Götaland", country: "Schweden" },
          }),
        };
      }),
    );
    expect(await reverseGeocode(58.8, 14)).toBe(
      "Sjötorp, Västra Götaland, Schweden",
    );
  });

  it("names a town-centre photo by its church/square, not a distant farm", async () => {
    // The real Kungsbacka main-square scene: Photon returns the square and the
    // church (plus shops/roads). Both must count as landmarks; the church wins.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("photon")) {
          return {
            ok: true,
            json: async () => ({
              features: [
                {
                  properties: { name: "Stortorget", osm_key: "place", osm_value: "square", city: "Kungsbacka", country: "Schweden" },
                  geometry: { coordinates: [12.0764, 57.48711] },
                },
                {
                  properties: { name: "Kungsbacka kyrka", osm_key: "amenity", osm_value: "place_of_worship", city: "Kungsbacka", country: "Schweden" },
                  geometry: { coordinates: [12.0767, 57.48755] },
                },
                {
                  properties: { name: "Storgatan", osm_key: "highway", osm_value: "living_street", city: "Kungsbacka", country: "Schweden" },
                  geometry: { coordinates: [12.0765, 57.4869] },
                },
                {
                  properties: { name: "Black Pearl", osm_key: "amenity", osm_value: "pub", city: "Kungsbacka", country: "Schweden" },
                  geometry: { coordinates: [12.0767, 57.487] },
                },
              ],
            }),
          };
        }
        return { ok: false }; // Nominatim shouldn't be needed
      }),
    );
    expect(await reverseGeocode(57.4870989, 12.0764125)).toBe(
      "Kungsbacka kyrka, Kungsbacka, Schweden",
    );
  });

  it("prefers the town over an obscure snapped farm in the Nominatim fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("photon")) {
          // Only shops/roads nearby → nothing Photon deems visitable.
          return {
            ok: true,
            json: async () => ({
              features: [
                {
                  properties: { name: "Gyroskungen", osm_key: "amenity", osm_value: "restaurant", city: "Kungsbacka", country: "Schweden" },
                  geometry: { coordinates: [12.0765, 57.4871] },
                },
              ],
            }),
          };
        }
        // Nominatim snapped the point to a farm ~1.5 km away (real captured shape).
        return {
          ok: true,
          json: async () => ({
            name: "Yttrekolla",
            address: {
              farm: "Yttrekolla",
              suburb: "Kolla Parkstad",
              town: "Kungsbacka",
              municipality: "Gemeinde Kungsbacka",
              county: "Provinz Halland",
              country: "Schweden",
            },
            display_name: "Yttrekolla, Kolla Parkstad, Kungsbacka, Schweden",
          }),
        };
      }),
    );
    expect(await reverseGeocode(57.4870989, 12.0764125)).toBe("Kungsbacka, Schweden");
  });
});

describe("pickNominatimPlace", () => {
  it("chooses the town over a snapped farm/locality name", () => {
    expect(
      pickNominatimPlace({
        name: "Yttrekolla",
        address: {
          farm: "Yttrekolla",
          town: "Kungsbacka",
          county: "Provinz Halland",
          country: "Schweden",
        },
      }),
    ).toBe("Kungsbacka, Schweden");
  });

  it("still honours a genuine natural feature over the settlement", () => {
    expect(
      pickNominatimPlace({
        address: { peak: "Jungfrau", village: "Lauterbrunnen", state: "Bern", country: "Schweiz" },
      }),
    ).toBe("Jungfrau, Bern, Schweiz");
  });

  it("falls back to display_name when nothing structured is present", () => {
    expect(
      pickNominatimPlace({ address: {}, display_name: "Somewhere remote" }),
    ).toBe("Somewhere remote");
  });
});

describe("rankNearbyCandidates", () => {
  const feat = (
    name: string,
    osm_key: string,
    osm_value: string,
    coordinates: number[],
  ) => ({ properties: { name, osm_key, osm_value }, geometry: { coordinates } });

  it("ranks landmark-first then nearest, dropping far and non-visitable features", () => {
    const lat = 47.404978;
    const lng = 8.381622;
    const out = rankNearbyCandidates(
      [
        feat("Theaterplatz", "tourism", "artwork", [8.38158, 47.40508]), // rank 5, near
        feat("Bruno Weber Park", "tourism", "museum", [8.38102, 47.40517]), // rank 0, near
        feat("Hauptstrasse", "highway", "residential", [8.3816, 47.4049]), // not visitable
        feat("Fernes Schloss", "historic", "castle", [14.06, 58.84]), // >500 m
      ],
      lat,
      lng,
    );
    expect(out.map((p) => p.name)).toEqual(["Bruno Weber Park", "Theaterplatz"]);
  });

  it("treats a named square and church as visitable, church ranked above the square", () => {
    const lat = 57.4870989;
    const lng = 12.0764125;
    const out = rankNearbyCandidates(
      [
        feat("Stortorget", "place", "square", [12.0764, 57.48711]), // rank 5, ~1 m
        feat("Kungsbacka kyrka", "amenity", "place_of_worship", [12.0767, 57.48755]), // rank 3, ~53 m
        feat("Gyroskungen", "amenity", "restaurant", [12.0765, 57.4871]), // not visitable
        feat("Storgatan", "highway", "living_street", [12.0765, 57.4869]), // not visitable
      ],
      lat,
      lng,
    );
    expect(out.map((p) => p.name)).toEqual(["Kungsbacka kyrka", "Stortorget"]);
  });

  it("returns an empty array when nothing visitable is in range", () => {
    expect(
      rankNearbyCandidates(
        [{ properties: { name: "Road", osm_key: "highway", osm_value: "primary" }, geometry: { coordinates: [8.38, 47.4] } }],
        47.4,
        8.38,
      ),
    ).toEqual([]);
  });
});
