// Put one geotagged photograph into a running stack.
//
//   node test/browser/seed-geo.mjs <supabase-url> <service-key>
//
// The global map plots photos that have coordinates and belong to a published
// post (getGeotaggedPhotos). A journey that writes posts through the UI still
// produces none, because locating a photograph means uploading one with GPS
// EXIF — so /map correctly renders its empty state and the map component never
// mounts at all.
//
// That would leave the map assertion with nothing to assert, and the map is the
// thing this project breaks most often and notices least: a dead worker still
// paints a convincing basemap. So the geodata is a fixture.
//
// It is a real object in the stack's own storage, not a URL somewhere else:
// Next's image optimizer only accepts the hosts in remotePatterns, and pointing
// at a public photo site would make CI depend on that site being up.

const [, , SUPABASE_URL, SERVICE_KEY] = process.argv;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("usage: node test/browser/seed-geo.mjs <supabase-url> <service-key>");
  process.exit(1);
}

const auth = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
};

// A 1x1 red PNG. The map draws markers, not photographs, so the pixels only
// have to be a decodable image for next/image.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const OBJECT = "e2e/lofoten.png";

const upload = await fetch(`${SUPABASE_URL}/storage/v1/object/photos/${OBJECT}`, {
  method: "POST",
  headers: { ...auth, "content-type": "image/png", "x-upsert": "true" },
  body: PNG,
});
if (!upload.ok && upload.status !== 409) {
  throw new Error(`upload failed: ${upload.status} ${await upload.text()}`);
}

const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/photos/${OBJECT}`;

// Attach it to whichever post is published — the journey publishes three, and
// which one does not matter, only that the post is public so the photo passes
// the `posts.published` filter.
const posts = await fetch(
  `${SUPABASE_URL}/rest/v1/posts?select=id,slug,lat,lng&published=is.true&limit=1`,
  { headers: auth },
).then((r) => r.json());

if (!posts.length) throw new Error("no published post to attach a photo to");
const post = posts[0];

const existing = await fetch(
  `${SUPABASE_URL}/rest/v1/photos?select=id&post_id=eq.${post.id}&url=eq.${encodeURIComponent(publicUrl)}`,
  { headers: auth },
).then((r) => r.json());

if (!existing.length) {
  // Reine, Lofoten. Real coordinates so the map's bounds are sane.
  const res = await fetch(`${SUPABASE_URL}/rest/v1/photos`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      post_id: post.id,
      url: publicUrl,
      caption: "Reine im Winterlicht",
      lat: 67.9333,
      lng: 13.0889,
      width: 1,
      height: 1,
    }),
  });
  if (!res.ok) throw new Error(`insert failed: ${res.status} ${await res.text()}`);
}

console.log(`seeded a geotagged photo on /posts/${post.slug} (67.9333, 13.0889)`);
