import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildDossier, buildStyleGuide } from "@/lib/ai/dossier";
import { makeFakeSupabase } from "../helpers/fake-supabase";

// buildDossier/buildStyleGuide take a SupabaseClient directly — pass the fake.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const client = (db: Parameters<typeof makeFakeSupabase>[0]) =>
  makeFakeSupabase(db) as any;

// buildDossier hits the network for weather (and may reverse-geocode). Keep unit
// tests offline with a benign fetch stub; individual tests override it.
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({}) })),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("buildDossier", () => {
  it("assembles trip, photos (time-sorted), tracks and notes into text", async () => {
    const supabase = client({
      posts: [
        {
          id: "p1",
          title: "T",
          location: "Berner Oberland",
          ai_notes: "Es regnete viel.",
          trip_id: "t1",
          trips: {
            title: "Alpenreise",
            summary: "Zwei Wochen.",
            start_date: "2026-06-01",
            end_date: "2026-06-14",
          },
        },
      ],
      photos: [
        {
          id: "ph-late",
          post_id: "p1",
          taken_at: "2026-06-02T10:00:00Z",
          place_name: "Gipfel",
          ai_description: "Aussicht",
          lat: 46.5,
          lng: 8,
          sort_order: 1,
        },
        {
          id: "ph-early",
          post_id: "p1",
          taken_at: "2026-06-01T08:00:00Z",
          place_name: "Tal",
          ai_description: "Start",
          lat: 46.4,
          lng: 8,
          sort_order: 0,
        },
      ],
      tracks: [{ post_id: "p1", name: "Etappe 1", distance_m: 12000 }],
    });

    const d = await buildDossier(supabase, "p1");
    expect(d.photos.map((p) => p.id)).toEqual(["ph-early", "ph-late"]); // by taken_at
    expect(d.text).toContain("Reise: Alpenreise");
    // A typed location wins over the geotagged photos (it can hold a curated name).
    expect(d.text).toContain("Ort (grob): Berner Oberland");
    expect(d.text).toContain("[photo:ph-early]");
    expect(d.text).toContain("Routen (GPX):");
    expect(d.text).toContain("Etappe 1");
    expect(d.text).toContain("12.0 km");
    expect(d.text).toContain("Notizen des Autors:");
    expect(d.text).toContain("Es regnete viel.");
  });

  it("uses the geotagged photos' place when the post has no stored location", async () => {
    const supabase = client({
      posts: [{ id: "p1", title: "T", location: null, ai_notes: null }],
      photos: [
        {
          id: "ph1",
          post_id: "p1",
          taken_at: "2026-06-01T08:00:00Z",
          lat: 47.4,
          lng: 8.38,
          place_name: "Dietikon, Schweiz",
          ai_description: "x",
          sort_order: 0,
        },
      ],
      tracks: [],
    });
    const d = await buildDossier(supabase, "p1");
    expect(d.text).toContain("Ort (grob): Dietikon, Schweiz");
  });

  it("adds a weather line for the day(s) the photos were taken", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          daily: {
            time: ["2026-06-01"],
            weather_code: [61],
            temperature_2m_max: [19],
            temperature_2m_min: [11],
            precipitation_sum: [4.2],
          },
        }),
      })),
    );
    const supabase = client({
      posts: [{ id: "p1", title: "T", location: "X", ai_notes: null }],
      photos: [
        {
          id: "ph1",
          post_id: "p1",
          taken_at: "2026-06-01T08:00:00Z",
          lat: 46.4,
          lng: 8,
          place_name: "Tal",
          ai_description: "x",
          sort_order: 0,
        },
      ],
      tracks: [],
    });
    const d = await buildDossier(supabase, "p1");
    expect(d.text).toContain("Wetter an diesen Tagen");
    expect(d.text).toContain("leichter Regen");
  });

  it("lists only author-defined interactions as must-place [ask:] tags", async () => {
    const supabase = client({
      posts: [{ id: "p1", title: "T", location: "X", ai_notes: null }],
      photos: [
        { id: "ph1", post_id: "p1", taken_at: null, lat: null, lng: null, sort_order: 0 },
      ],
      tracks: [],
      interactions: [
        {
          id: "ix1",
          post_id: "p1",
          kind: "poll",
          question: "Lieblingspass?",
          options: ["A", "B"],
          source: "author",
          sort_order: 0,
        },
        {
          id: "ix2",
          post_id: "p1",
          kind: "quiz",
          question: "Wie hoch?",
          options: ["1", "2"],
          source: "ai",
          sort_order: 1,
        },
      ],
    });
    const d = await buildDossier(supabase, "p1");
    expect(d.interactions.map((i) => i.id)).toEqual(["ix1"]); // author only
    expect(d.text).toContain("[ask:ix1]");
    expect(d.text).toContain("Lieblingspass?");
    expect(d.text).not.toContain("[ask:ix2]"); // AI-generated excluded
  });

  it("derives location, coordinates and date from a GPX track (no geo-photos)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          address: { village: "Aschheim", county: "München", country: "Deutschland" },
        }),
      })),
    );
    const supabase = client({
      posts: [{ id: "p1", title: "T", location: null, ai_notes: null, lat: null, lng: null }],
      photos: [
        { id: "ph1", post_id: "p1", taken_at: null, lat: null, lng: null, sort_order: 0 },
      ],
      tracks: [
        {
          post_id: "p1",
          name: "Radrunde",
          distance_m: 12000,
          started_at: "2026-05-20T07:00:00Z",
          geojson: {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                geometry: {
                  type: "LineString",
                  coordinates: [
                    [11.72, 48.17],
                    [11.73, 48.18],
                  ],
                },
                properties: {},
              },
            ],
          },
        },
      ],
    });
    const d = await buildDossier(supabase, "p1");
    expect(d.geo?.place).toBe("Aschheim"); // town, not the nearest landmark
    expect(d.geo?.lat).toBeCloseTo(48.17); // GPX start, not a photo
    expect(d.geo?.lng).toBeCloseTo(11.72);
    expect(d.date).toBe("2026-05-20"); // from the track's start time
  });

  it("works with no trip, tracks or notes", async () => {
    const supabase = client({
      posts: [{ id: "p1", title: "T", location: null, ai_notes: null }],
      photos: [
        { id: "ph1", post_id: "p1", taken_at: null, lat: null, lng: null, sort_order: 0 },
      ],
      tracks: [],
    });
    const d = await buildDossier(supabase, "p1");
    expect(d.text).toContain("[photo:ph1]");
    expect(d.text).not.toContain("Routen (GPX):");
    expect(d.text).not.toContain("Notizen des Autors:");
  });
});

describe("buildStyleGuide", () => {
  it("uses recent published posts as a voice sample", async () => {
    const supabase = client({
      posts: [
        { id: "other", title: "Frühere Reise", body: "Wir wanderten lange.", published: true, published_at: "2026-05-01" },
      ],
    });
    const guide = await buildStyleGuide(supabase, "p1");
    expect(guide).toContain("Frühere Reise");
    expect(guide).toContain("Wir wanderten lange.");
  });

  it("falls back to a generic voice when there are no prior posts", async () => {
    const supabase = client({ posts: [] });
    const guide = await buildStyleGuide(supabase, "p1");
    expect(guide).toMatch(/Reisetagebuch/);
  });
});
