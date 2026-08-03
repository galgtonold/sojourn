// Builds a minimal in-memory dataset for one post with a few enriched photos,
// shaped like the columns the AI routes select.
import { randomUUID } from "node:crypto";
import type { FakeDb } from "./fake-supabase";

export function makeSeed(
  opts: { photoCount?: number; enriched?: boolean; pending?: boolean } = {},
) {
  const photoCount = opts.photoCount ?? 3;
  const enriched = opts.enriched ?? true;
  // "pending" photos have a place name (so enrichment won't reverse-geocode) but
  // no description yet — exercises the description path without external HTTP.
  const pending = opts.pending ?? false;
  const postId = randomUUID();

  const photos = Array.from({ length: photoCount }, (_, i) => ({
    id: randomUUID(),
    post_id: postId,
    url: `https://example.test/p${i + 1}.jpg`,
    storage_path: `p${i + 1}.jpg`,
    caption: null,
    alt: null,
    width: 1600,
    height: 1067,
    blurhash: null,
    lat: 46.5 + i * 0.01,
    lng: 8.0 + i * 0.01,
    taken_at: `2026-06-0${i + 1}T09:0${i}:00Z`,
    place_name: enriched || pending ? `Ort ${i + 1}` : null,
    ai_description: enriched && !pending ? `Beschreibung ${i + 1}` : null,
    enriched_at: enriched && !pending ? "2026-06-07T00:00:00Z" : null,
    sort_order: i,
  }));

  const db: FakeDb = {
    posts: [
      {
        id: postId,
        title: "Entwurf",
        slug: "entwurf",
        location: "Berner Oberland",
        excerpt: null,
        body: null,
        cover_image: null,
        ai_notes: null,
        trip_id: null,
        published: false,
        published_at: null,
      },
    ],
    photos,
    tracks: [],
    interactions: [],
    // The caller's profile. `adminRoute` looks this up and refuses with 403
    // when it is missing, because a Supabase session on its own proves nothing
    // about authority — every capability in the schema is read from this row.
    // Without it the whole AI pipeline 403s, which is the gate doing its job.
    // `user-1` is makeFakeSupabase's default signed-in id.
    profiles: [{ id: "user-1", email: "owner@sojourn.test", role: "owner" }],
  };

  return { db, postId, photoIds: photos.map((p) => p.id) };
}
