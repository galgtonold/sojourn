// eval/harness/fixture.ts
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";

const manifest = z.object({
  slug: z.string(),
  source: z.string().optional(),
  lang: z.enum(["de", "en"]).default("de"),
  ask: z.string().optional(),
  notes: z.string().optional(),
  answers: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
  trip: z.object({ title: z.string(), start_date: z.string() }),
  photos: z.array(
    z.object({
      file: z.string(),
      lat: z.number(),
      lng: z.number(),
      taken_at: z.string(),
      place_name: z.string().optional(),
    }),
  ).min(1),
  track: z.string().optional(),
  reference: z.string().optional(),
});

export type LoadedFixture = {
  slug: string;
  lang: "de" | "en";
  ask?: string;
  notes?: string;
  answers: { question: string; answer: string }[];
  db: Record<string, Record<string, unknown>[]>;
  postId: string;
  photoIds: string[];
  reference?: string;
  trackPresent: boolean;
};

function dataUrl(path: string): string {
  const b64 = readFileSync(path).toString("base64");
  return `data:image/jpeg;base64,${b64}`;
}

export function loadFixture(dir: string): LoadedFixture {
  const m = manifest.parse(JSON.parse(readFileSync(join(dir, "fixture.json"), "utf8")));
  const postId = randomUUID();
  const photoIds: string[] = [];
  const photos = m.photos.map((p, i) => {
    const id = randomUUID();
    photoIds.push(id);
    return {
      id, post_id: postId,
      url: dataUrl(join(dir, p.file)),
      storage_path: p.file,
      lat: p.lat, lng: p.lng, taken_at: p.taken_at,
      place_name: p.place_name ?? null,
      ai_description: null, enriched_at: null,
      caption: null, alt: null, width: null, height: null, blurhash: null,
      sort_order: i,
    };
  });
  const post = {
    id: postId, title: m.trip.title, slug: m.slug,
    location: null, excerpt: null, body: null, cover_image: null,
    ai_notes: m.notes ?? null, trip_id: null, published: false, published_at: null,
    source_locale: m.lang, translation_status: "none", i18n: null, i18n_source_hash: null,
  };
  return {
    slug: m.slug, lang: m.lang, ask: m.ask, notes: m.notes,
    answers: m.answers.map((x) => ({ question: x.q, answer: x.a })),
    db: { posts: [post], photos, tracks: [], interactions: [] },
    postId, photoIds,
    reference: m.reference && existsSync(join(dir, m.reference))
      ? readFileSync(join(dir, m.reference), "utf8") : undefined,
    trackPresent: Boolean(m.track),
  };
}
