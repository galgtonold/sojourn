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

  it("prefers an enclosing named POI (Overpass) over the snapped object", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("overpass")) {
          return {
            ok: true,
            json: async () => ({
              elements: [
                { tags: { name: "Theaterplatz", tourism: "artwork" } },
                { tags: { name: "Bruno Weber Park", tourism: "museum" } },
                { tags: { name: "Aargau", boundary: "administrative" } },
              ],
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            address: { tourism: "Theaterplatz", state: "Aargau", country: "Schweiz" },
          }),
        };
      }),
    );
    // The museum (rank 0) beats the artwork; the admin boundary is ignored.
    expect(await reverseGeocode(47.4, 8.38)).toBe(
      "Bruno Weber Park, Aargau, Schweiz",
    );
  });

  it("uses the reverse-geocoded place when no enclosing POI exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("overpass")) {
          return { ok: true, json: async () => ({ elements: [] }) };
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
