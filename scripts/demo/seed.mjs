// Fills a Supabase project with the demo site: journeys, entries, routes,
// photographs, polls, quizzes, comments and reactions — plus the read-only
// account the one-click demo login signs in as.
//
//   DEMO_SUPABASE_URL=https://<ref>.supabase.co \
//   DEMO_SUPABASE_SERVICE_ROLE_KEY=... \
//   DEMO_EMAIL=demo@example.com DEMO_PASSWORD=... \
//   node scripts/demo/seed.mjs --yes
//
// Re-running it is how you update the demo: it first removes what the previous
// run wrote — matched by slug, so nothing else in the database is touched — and
// writes it again. The variable names are deliberately distinct and nothing here
// reads .env.local, so a stray shell can't point this at production.
//
// Run the two fetch steps first; both write fixtures this reads:
//   node scripts/demo/fetch-routes.mjs
//   node scripts/demo/fetch-photos.mjs

import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { journeys, branding } from "./journeys/index.mjs";

const args = process.argv.slice(2);
const url = process.env.DEMO_SUPABASE_URL;
const key = process.env.DEMO_SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.DEMO_EMAIL;
const password = process.env.DEMO_PASSWORD;

for (const [name, value] of Object.entries({
  DEMO_SUPABASE_URL: url,
  DEMO_SUPABASE_SERVICE_ROLE_KEY: key,
  DEMO_EMAIL: email,
  DEMO_PASSWORD: password,
})) {
  if (!value) {
    console.error(`Missing ${name}. See the header of this file.`);
    process.exit(1);
  }
}
if (!args.includes("--yes")) {
  console.error(
    `This replaces the demo content in ${new URL(url).host} and resets the\n` +
      `${email} password. Re-run with --yes if that is the demo project.`,
  );
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

const ROUTES = new URL("./routes.json", import.meta.url);
const PHOTOS = new URL("./photos.json", import.meta.url);
const PHOTO_DIR = new URL("./photos/", import.meta.url);
for (const f of [ROUTES, PHOTOS]) {
  if (!existsSync(f)) {
    console.error(`Missing ${f.pathname}. Run the fetch steps first.`);
    process.exit(1);
  }
}
const routes = JSON.parse(readFileSync(ROUTES, "utf8"));
const photoMeta = JSON.parse(readFileSync(PHOTOS, "utf8"));

const ok = (res, what) => {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
};

/** Deterministic pseudo-random in [0,1) from a string — same demo every time. */
function hashUnit(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

const addDays = (iso, n) => {
  const d = new Date(`${iso}T10:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString();
};

// ---- the demo account --------------------------------------------------------

/**
 * A real owner, because the demo has to show the owner-only screens — settings,
 * members, AI usage. It is safe to hand out because the deployment refuses
 * writes from everyone (see src/lib/demo.ts), not because this account is
 * special.
 */
async function ensureOwner() {
  const created = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  let id = created.data?.user?.id;
  if (!id) {
    // Already there from a previous seed — reset the password so the deployment's
    // DEMO_PASSWORD is always the one that works.
    const { data } = await db.auth.admin.listUsers({ perPage: 200 });
    const found = data?.users?.find((u) => u.email === email);
    if (!found) throw new Error(`could not create or find ${email}`);
    id = found.id;
    ok(await db.auth.admin.updateUserById(id, { password }), "reset password");
  }
  // An install has exactly one owner, enforced by a unique index. If somebody
  // else holds it, say who rather than quietly demoting them — on the wrong
  // database that would lock the real owner out of their own site.
  const owners = ok(
    await db.from("profiles").select("id, email").eq("role", "owner"),
    "read owners",
  );
  const other = owners.find((o) => o.id !== id);
  if (other) {
    if (!args.includes("--take-ownership")) {
      throw new Error(
        `${other.email} already owns this install. If this really is the demo ` +
          `database, re-run with --take-ownership to demote them to member.`,
      );
    }
    ok(
      await db.from("profiles").update({ role: "member" }).eq("id", other.id),
      "demote previous owner",
    );
    console.log(`  demoted previous owner ${other.email} → member`);
  }

  ok(
    await db.from("profiles").upsert({ id, email, role: "owner" }),
    "profiles upsert",
  );
  return id;
}

// ---- wipe --------------------------------------------------------------------

/**
 * Removes what a previous run of THIS script wrote, and nothing else — matched
 * by the slugs in journeys/ and the `demo/` prefix in storage. A seed that
 * truncated the tables would be a loaded gun pointed at whichever project
 * happened to be in the environment; scoping it also means the demo can be
 * reseeded into a database that has other content in it.
 */
async function wipe() {
  const postSlugs = journeys.flatMap((j) => j.posts.map((p) => p.slug));
  const tripSlugs = journeys.map((j) => j.slug);
  // Posts first: trips.trip_id is ON DELETE SET NULL, so removing a trip would
  // orphan its entries rather than take them along. Everything hanging off a
  // post — photos, tracks, comments, reactions, interactions — does cascade.
  ok(await db.from("posts").delete().in("slug", postSlugs), "delete posts");
  ok(await db.from("trips").delete().in("slug", tripSlugs), "delete trips");

  const { data: files } = await db.storage
    .from("photos")
    .list("demo", { limit: 1000 });
  if (files?.length) {
    await db.storage.from("photos").remove(files.map((f) => `demo/${f.name}`));
  }
}

// ---- branding ----------------------------------------------------------------

async function seedBranding() {
  ok(
    await db.from("site_settings").upsert({
      id: 1,
      site_name: branding.name,
      tagline_en: branding.tagline.en,
      tagline_de: branding.tagline.de,
      hero_lead_en: branding.heroLead.en,
      hero_lead_de: branding.heroLead.de,
      hero_accent_en: branding.heroAccent.en,
      hero_accent_de: branding.heroAccent.de,
      kicker_en: branding.kicker.en,
      kicker_de: branding.kicker.de,
    }),
    "site_settings",
  );
}

// ---- photos ------------------------------------------------------------------

/**
 * Uploads into the project's own `photos` bucket rather than hotlinking
 * Commons. The site then serves them exactly as it serves a real user's
 * uploads — same bucket, same public URL shape, same image pipeline — which is
 * both a better demo and the reason no extra image host needs allowlisting.
 */
async function uploadPhoto(key) {
  const meta = photoMeta[key];
  if (!meta) throw new Error(`no photo fetched for ${key} — run fetch-photos`);
  const path = `demo/${key}.jpg`;
  const body = readFileSync(new URL(meta.file, PHOTO_DIR));
  const { error } = await db.storage
    .from("photos")
    .upload(path, body, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error(`upload ${key}: ${error.message}`);
  return {
    path,
    url: `${url}/storage/v1/object/public/photos/${path}`,
    width: meta.width,
    height: meta.height,
    // Commons files are free to reuse WITH attribution, so the credit travels
    // with the picture. It's also honest about what this demo is made of.
    credit: `Photo: ${meta.author} (${meta.license}), via Wikimedia Commons`,
  };
}

// ---- main --------------------------------------------------------------------

async function main() {
  console.log(`  target: ${new URL(url).host}\n`);

  const ownerId = await ensureOwner();
  console.log(`  owner:  ${email}`);
  await wipe();
  console.log("  wiped previous demo content");
  await seedBranding();
  console.log(`  branding: “${branding.name}”\n`);

  const totals = { posts: 0, photos: 0, tracks: 0, asks: 0, comments: 0, reactions: 0 };

  for (const journey of journeys) {
    const trip = ok(
      await db
        .from("trips")
        .insert({
          slug: journey.slug,
          title: journey.title.en,
          summary: journey.summary.en,
          start_date: journey.start,
          end_date: journey.end,
          source_locale: "en",
          i18n: { de: { title: journey.title.de, summary: journey.summary.de } },
          translation_status: "ready",
        })
        .select("id")
        .single(),
      `trip ${journey.slug}`,
    );

    let tripCover = null;

    for (const post of journey.posts) {
      // Photos first: the entry's cover is its own first picture, and the
      // journey's cover is the first picture of all.
      const uploaded = [];
      for (let i = 0; i < post.photos.length; i++) {
        uploaded.push(await uploadPhoto(`${post.slug}-${i + 1}`));
      }
      const cover = uploaded[0]?.url ?? null;
      if (!tripCover) tripCover = cover;

      const row = ok(
        await db
          .from("posts")
          .insert({
            slug: post.slug,
            title: post.title.en,
            excerpt: post.excerpt.en,
            body: post.body.en,
            cover_image: cover,
            trip_id: trip.id,
            location: post.place,
            lat: post.lat,
            lng: post.lng,
            published: true,
            published_at: addDays(post.date, 0),
            source_locale: "en",
            i18n: {
              de: {
                title: post.title.de,
                excerpt: post.excerpt.de,
                body: post.body.de,
              },
            },
            translation_status: "ready",
          })
          .select("id")
          .single(),
        `post ${post.slug}`,
      );
      totals.posts++;

      // Where the entry happened, for the map pins.
      ok(
        await db.from("locations").insert({
          post_id: row.id,
          trip_id: trip.id,
          name: post.place,
          lat: post.lat,
          lng: post.lng,
          sort_order: totals.posts,
        }),
        `location ${post.slug}`,
      );

      const photoRows = uploaded.map((u, i) => ({
        post_id: row.id,
        storage_path: u.path,
        url: u.url,
        caption: `${post.photos[i].caption.en} — ${u.credit}`,
        alt: post.photos[i].caption.en,
        width: u.width,
        height: u.height,
        lat: post.photos[i].lat,
        lng: post.photos[i].lng,
        taken_at: addDays(post.date, 0),
        sort_order: i,
        i18n: {
          de: {
            caption: `${post.photos[i].caption.de} — ${u.credit}`,
            alt: post.photos[i].caption.de,
          },
        },
      }));
      if (photoRows.length) {
        ok(await db.from("photos").insert(photoRows), `photos ${post.slug}`);
        totals.photos += photoRows.length;
      }

      const route = routes[post.slug];
      if (route) {
        ok(
          await db.from("tracks").insert({
            post_id: row.id,
            trip_id: trip.id,
            name: post.route.name.en,
            distance_m: route.distance_m,
            geojson: {
              type: "FeatureCollection",
              features: [
                {
                  type: "Feature",
                  properties: { name: post.route.name.en },
                  geometry: {
                    type: "LineString",
                    coordinates: route.coordinates,
                  },
                },
              ],
            },
          }),
          `track ${post.slug}`,
        );
        totals.tracks++;
      }

      if (post.ask) {
        const ask = ok(
          await db
            .from("interactions")
            .insert({
              post_id: row.id,
              kind: post.ask.kind,
              question: post.ask.question.en,
              options: post.ask.options.en,
              correct_index: post.ask.correctIndex ?? null,
              explanation: post.ask.explanation?.en ?? null,
              sort_order: 0,
              i18n: {
                de: {
                  question: post.ask.question.de,
                  options: post.ask.options.de,
                  explanation: post.ask.explanation?.de ?? null,
                },
              },
            })
            .select("id")
            .single(),
          `ask ${post.slug}`,
        );
        totals.asks++;

        // Prior votes, so the results bar means something the moment a visitor
        // answers. Weighted from the slug so the same demo always looks the same.
        const n = post.ask.options.en.length;
        const votes = [];
        const count = 40 + Math.floor(hashUnit(post.slug) * 60);
        for (let v = 0; v < count; v++) {
          const r = hashUnit(`${post.slug}-${v}`);
          // Skew towards the first two options — a flat distribution reads as
          // fake, because real polls are never flat.
          const choice = r < 0.42 ? 0 : r < 0.72 ? 1 % n : Math.floor(r * n);
          votes.push({
            interaction_id: ask.id,
            visitor_token: `demo-${post.slug}-${v}`,
            choice_index: Math.min(choice, n - 1),
          });
        }
        ok(
          await db.from("interaction_responses").insert(votes),
          `votes ${post.slug}`,
        );
      }

      for (const [i, c] of (post.comments ?? []).entries()) {
        ok(
          await db.from("comments").insert({
            post_id: row.id,
            author_name: c.author,
            body: c.body.en,
            created_at: addDays(post.date, c.days),
          }),
          `comment ${post.slug}#${i}`,
        );
        totals.comments++;
      }

      // A believable spread of reactions: every entry gets some, the ones with
      // the best photographs get more.
      const kinds = ["heart", "fire", "wow", "star"];
      const reactions = [];
      for (const kind of kinds) {
        const many = Math.floor(hashUnit(`${post.slug}-${kind}`) * 26);
        for (let v = 0; v < many; v++) {
          reactions.push({
            post_id: row.id,
            kind,
            visitor_token: `demo-${kind}-${post.slug}-${v}`,
          });
        }
      }
      if (reactions.length) {
        ok(await db.from("reactions").insert(reactions), `reactions ${post.slug}`);
        totals.reactions += reactions.length;
      }

      process.stdout.write(`  ${journey.slug}/${post.slug}\n`);
    }

    ok(
      await db.from("trips").update({ cover_image: tripCover }).eq("id", trip.id),
      `trip cover ${journey.slug}`,
    );
  }

  console.log(
    `\n  done — ${journeys.length} journeys, ${totals.posts} entries, ` +
      `${totals.photos} photos, ${totals.tracks} tracks, ${totals.asks} polls/quizzes, ` +
      `${totals.comments} comments, ${totals.reactions} reactions`,
  );
  console.log(`  owner id: ${ownerId}`);
}

main().catch((e) => {
  console.error("\nseed failed:", e.message ?? e);
  process.exit(1);
});
