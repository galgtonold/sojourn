// Dev-only: fill the LOCAL database with a many-years-of-travelling amount of
// content, so map and payload work can be judged at the size the site will
// actually reach rather than at seed size.
//
//   node scripts/seed-scale.mjs --voyages 25 [--geometry path/to/lines.json]
//
// Each voyage is a copy of one real journey's shape, moved to its own corner of
// the world, so 25 voyages look like 25 journeys instead of 25 tracings of the
// same one. Without --geometry it synthesises routes with realistic fix spacing
// and the occasional rest stop, so the script is useful on a fresh checkout.
//
// Photos reference a handful of existing URLs on purpose: the ROW count is what
// loads a page, and copying gigabytes of JPEGs would prove nothing.
//
// Refuses to run against anything but localhost.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1]]);
    return acc;
  }, []),
);
const VOYAGES = Number(args.voyages ?? 25);

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!/localhost|127\.0\.0\.1/.test(url ?? "")) {
  console.error(`Refusing to seed a non-local database: ${url}`);
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

// ---- the shape of one voyage -------------------------------------------------

/** Real geometry if given, else routes with believable fix spacing and rests. */
function loadGeometry() {
  if (args.geometry) {
    const lines = JSON.parse(readFileSync(args.geometry, "utf8"));
    console.log(`  geometry: ${lines.length} real tracks from ${args.geometry}`);
    return lines;
  }
  console.log("  geometry: synthesised (pass --geometry for real tracks)");
  const lines = [];
  for (let t = 0; t < 43; t++) {
    const pts = [];
    let lng = 10 + t * 0.05;
    let lat = 57 + t * 0.03;
    let ele = 20 + t;
    const n = 600 + ((t * 37) % 400);
    for (let i = 0; i < n; i++) {
      // ~4 m of travel per fix, with a metre or two of wander, plus a pause
      // every so often where the receiver sits still and drifts.
      const resting = i % 220 > 200;
      const step = resting ? 0.0000002 : 0.000036;
      lng += step + Math.sin(i / 7) * 0.000012;
      lat += step * 0.6 + Math.cos(i / 11) * 0.0000012;
      ele += Math.sin(i / 90) * 0.6;
      pts.push([+lng.toFixed(7), +lat.toFixed(7), +ele.toFixed(1)]);
    }
    lines.push(pts);
  }
  return lines;
}

/** Somewhere different for each voyage — a rough ring around the globe. */
function offsetFor(v) {
  const ring = (v * 137.5) % 360; // golden angle: spreads without clustering
  return {
    dLng: ((ring + 180) % 360) - 180 - 10,
    dLat: Math.sin((v * 2.4) % (Math.PI * 2)) * 35 - 12,
  };
}

const PLACES = ["Skandinavien", "Patagonien", "Hokkaido", "Anatolien", "Karpaten",
  "Atlas", "Pyrenäen", "Kaukasus", "Island", "Neuseeland", "Peru", "Vietnam",
  "Korsika", "Norwegen", "Schottland", "Alpen", "Balkan", "Portugal", "Chile",
  "Nepal", "Marokko", "Kanada", "Taiwan", "Slowenien", "Irland"];

const PHOTO_URLS = [
  "https://images.unsplash.com/photo-1506905925346-21bda4d32df4",
  "https://images.unsplash.com/photo-1519681393784-d120267933ba",
  "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05",
];

async function main() {
  const geometry = loadGeometry();
  const points = geometry.reduce((s, l) => s + l.length, 0);
  console.log(
    `  target: ${VOYAGES} voyages x ${geometry.length} tracks = ${(VOYAGES * geometry.length).toLocaleString()} tracks, ` +
      `${(VOYAGES * points).toLocaleString()} points\n`,
  );

  for (let v = 0; v < VOYAGES; v++) {
    const { dLng, dLat } = offsetFor(v);
    const name = `${PLACES[v % PLACES.length]} ${2001 + v}`;
    const slug = `scale-${String(v + 1).padStart(2, "0")}-${PLACES[v % PLACES.length].toLowerCase()}`;
    const year = 2001 + v;

    const { data: trip, error: tripErr } = await db
      .from("trips")
      .insert({
        slug,
        title: name,
        summary: `Testdaten: ${name}.`,
        start_date: `${year}-06-01`,
        end_date: `${year}-07-15`,
        source_locale: "de",
      })
      .select("id")
      .single();
    if (tripErr) throw tripErr;

    // 9 entries per voyage, tracks and photos spread across them.
    const posts = [];
    for (let p = 0; p < 9; p++) {
      posts.push({
        slug: `${slug}-tag-${p + 1}`,
        title: `Tag ${p + 1} — ${name}`,
        excerpt: `Kurzer Auszug für Tag ${p + 1}.`,
        body: `## Tag ${p + 1}\n\nTestinhalt für Lastmessungen.\n`,
        trip_id: trip.id,
        location: name,
        lat: 57 + dLat,
        lng: 10 + dLng,
        published: true,
        published_at: `${year}-06-${String(p + 1).padStart(2, "0")}`,
        source_locale: "de",
      });
    }
    const { data: inserted, error: postErr } = await db
      .from("posts")
      .insert(posts)
      .select("id");
    if (postErr) throw postErr;

    const tracks = geometry.map((line, i) => ({
      post_id: inserted[i % inserted.length].id,
      trip_id: trip.id,
      name: `Etappe ${i + 1}`,
      distance_m: line.length * 4.2,
      geojson: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { name: `Etappe ${i + 1}` },
            geometry: {
              type: "LineString",
              coordinates: line.map((c) => [
                +(c[0] + dLng).toFixed(7),
                +(c[1] + dLat).toFixed(7),
                ...(c.length > 2 ? [c[2]] : []),
              ]),
            },
          },
        ],
      },
    }));
    // Chunked: a voyage of tracks is several MB of JSON.
    for (let i = 0; i < tracks.length; i += 8) {
      const { error } = await db.from("tracks").insert(tracks.slice(i, i + 8));
      if (error) throw error;
    }

    const photos = [];
    for (let i = 0; i < 110; i++) {
      const seed = geometry[i % geometry.length][0];
      photos.push({
        post_id: inserted[i % inserted.length].id,
        storage_path: `scale/${slug}/${i}.webp`,
        url: `${PHOTO_URLS[i % PHOTO_URLS.length]}?w=1600&q=70&sig=${v}-${i}`,
        caption: `Bild ${i + 1}`,
        width: 1600,
        height: 1067,
        lat: +(seed[1] + dLat).toFixed(6),
        lng: +(seed[0] + dLng).toFixed(6),
        sort_order: i,
      });
    }
    const { error: photoErr } = await db.from("photos").insert(photos);
    if (photoErr) throw photoErr;

    process.stdout.write(`  seeded ${v + 1}/${VOYAGES}  ${name}\r`);
  }

  const counts = await Promise.all(
    ["trips", "posts", "tracks", "photos"].map(async (t) => {
      const { count } = await db.from(t).select("*", { count: "exact", head: true });
      return `${t}=${count}`;
    }),
  );
  console.log(`\n  done. ${counts.join("  ")}`);
}

main().catch((e) => {
  console.error("\nseed-scale failed:", e.message ?? e);
  process.exit(1);
});
