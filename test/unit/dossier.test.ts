import { describe, it, expect } from "vitest";
import { buildDossier, buildStyleGuide } from "@/lib/ai/dossier";
import { makeFakeSupabase } from "../helpers/fake-supabase";

// buildDossier/buildStyleGuide take a SupabaseClient directly — pass the fake.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const client = (db: Parameters<typeof makeFakeSupabase>[0]) =>
  makeFakeSupabase(db) as any;

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
    expect(d.text).toContain("Ort (grob): Berner Oberland");
    expect(d.text).toContain("[photo:ph-early]");
    expect(d.text).toContain("Routen (GPX):");
    expect(d.text).toContain("Etappe 1");
    expect(d.text).toContain("12.0 km");
    expect(d.text).toContain("Notizen des Autors:");
    expect(d.text).toContain("Es regnete viel.");
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
