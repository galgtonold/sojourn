// eval/harness/fixture.ts
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";

// A deterministic, valid UUID derived from a seed. Fixture post/photo ids must
// be stable across runs: a random id changes the dossier text (it carries
// [photo:<id>] tags) on every run, which busts the content-addressed request
// cache and makes generation non-deterministic. Shaped as a v5 UUID so the
// routes' z.string().uuid() accepts it.
function stableUuid(seed: string): string {
  const h = createHash("sha256").update(seed).digest("hex");
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return (
    h.slice(0, 8) + "-" + h.slice(8, 12) + "-5" + h.slice(13, 16) + "-" +
    variant + h.slice(17, 20) + "-" + h.slice(20, 32)
  );
}

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
  const postId = stableUuid(m.slug);
  const photoIds: string[] = [];
  const photos = m.photos.map((p, i) => {
    const id = stableUuid(`${m.slug}:photo:${i}`);
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
  // A track file is a JSON object matching the `tracks` row the pipeline reads
  // ({ name, distance_m, geojson, started_at }); attach it to this post so the
  // GPX path (location grounding, weather fallback, the "Routen (GPX)" dossier
  // section) is genuinely exercised. Absent → no track, as before.
  const tracks = m.track
    ? [{ post_id: postId, ...(JSON.parse(readFileSync(join(dir, m.track), "utf8")) as Record<string, unknown>) }]
    : [];
  return {
    slug: m.slug, lang: m.lang, ask: m.ask, notes: m.notes,
    answers: m.answers.map((x) => ({ question: x.q, answer: x.a })),
    db: { posts: [post], photos, tracks, interactions: [] },
    postId, photoIds,
    reference: m.reference && existsSync(join(dir, m.reference))
      ? readFileSync(join(dir, m.reference), "utf8") : undefined,
    trackPresent: Boolean(m.track),
  };
}
