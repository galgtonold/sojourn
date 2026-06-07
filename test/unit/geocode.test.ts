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
});
