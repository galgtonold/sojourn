import { describe, it, expect, vi, afterEach } from "vitest";
import { reverseGeocode } from "@/lib/ai/geocode";

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
});
