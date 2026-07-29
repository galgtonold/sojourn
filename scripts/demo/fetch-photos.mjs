// Finds a real photograph of each real place in the demo and downloads it.
//
//   node scripts/demo/fetch-photos.mjs [--only <key>]
//   node scripts/demo/fetch-photos.mjs --list "search term"   (what would it pick?)
//
// Search relevance is not the same as "a photo of this place": the coast at
// Abashiri first returned a MODIS satellite pass of the whole of Japan. Use
// --list to see the candidates, then pin the right one with `file:` on the
// photo in journeys/ — `search` is the convenience, `file` is the guarantee.
//
// Source is Wikimedia Commons, for two reasons. It has photographs OF THE PLACE
// — a picture of Nusfjord on the Nusfjord entry, not a generic fjord — which is
// the difference between a demo that looks made up and one that doesn't. And
// every file there carries an explicit free licence and a named author, so the
// demo can credit them properly instead of quietly hotlinking somebody's work.
//
// Images land in scripts/demo/photos/ (gitignored — they're megabytes, and this
// script can always make them again) alongside photos.json, which records what
// was chosen, by whom, under what licence. Read that file before seeding: the
// search picks the best candidate it can see, not necessarily the best one.
//
// The seed step uploads these into the demo project's own storage bucket, so
// the running site serves them from Supabase like any other photo — no remote
// image host to allowlist, and the real photo pipeline gets exercised.

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { allPhotoRequests } from "./journeys/index.mjs";

const API = "https://commons.wikimedia.org/w/api.php";
const UA = "sojourn-demo-seed/1.0 (https://github.com/galgtonold/sojourn)";
const DIR = new URL("./photos/", import.meta.url);
const OUT = new URL("./photos.json", import.meta.url);
const WIDTH = 1600;

const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const list = args.includes("--list") ? args[args.indexOf("--list") + 1] : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Commons' metadata arrives as HTML (links, spans); captions want plain text. */
function plain(html) {
  return (html ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function query(params) {
  const url =
    `${API}?action=query&format=json&${params}` +
    `&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=${WIDTH}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const data = await res.json();
  return Object.values(data.query?.pages ?? {});
}

const search = (term) =>
  query(
    `generator=search&gsrsearch=${encodeURIComponent(`filetype:bitmap ${term}`)}` +
      `&gsrnamespace=6&gsrlimit=25`,
  );

/** One named file, exactly — how a photo gets pinned once a search misleads. */
const byFile = (title) =>
  query(`titles=${encodeURIComponent(title.replace(/^(File:)?/, "File:"))}`);

/**
 * The first candidate that actually works as a hero image: landscape, big
 * enough not to be upscaled, and a photograph rather than a map, diagram or
 * scanned document — Commons is full of all three, and they rank well.
 */
function pick(pages) {
  const rejects = /\b(map|karte|diagram|chart|logo|coat of arms|seal|flag|plan|scan|poster|stamp)\b/i;
  const candidates = pages
    .map((p) => ({ page: p, info: p.imageinfo?.[0] }))
    .filter(({ page, info }) => {
      if (!info?.thumburl) return false;
      if (!/\.(jpe?g|png)$/i.test(page.title)) return false;
      if (info.width < WIDTH || info.height < 900) return false;
      if (info.width / info.height < 1.2) return false; // portrait / square
      if (info.width / info.height > 3) return false; // stitched panorama
      if (rejects.test(page.title)) return false;
      return true;
    });
  // Commons ranks by search relevance; among the acceptable ones prefer the
  // highest resolution, which correlates well with "somebody meant this one".
  candidates.sort((a, b) => b.info.width * b.info.height - a.info.width * a.info.height);
  return candidates[0] ?? null;
}

async function download(url, path) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`download ${res.status} ${res.statusText}`);
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
}

async function main() {
  if (list) {
    const pages = await search(list);
    console.log(`\n  candidates for "${list}":\n`);
    for (const p of pages) {
      const i = p.imageinfo?.[0];
      if (!i) continue;
      const ok = pick([p]) ? "✓" : " ";
      console.log(`  ${ok} ${String(i.width).padStart(5)}×${String(i.height).padEnd(5)} ${p.title}`);
    }
    console.log(`\n  ✓ = would be accepted. Pin one with file: "<title>".\n`);
    return;
  }

  mkdirSync(DIR, { recursive: true });
  const manifest = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};

  const requests = allPhotoRequests().filter((r) =>
    only ? r.key === only : !manifest[r.key],
  );
  console.log(
    `  ${allPhotoRequests().length} photos, ${requests.length} to fetch\n`,
  );

  const missing = [];
  for (const req of requests) {
    // A pinned file wins outright, and skips the quality filter — if it was
    // named deliberately, it was looked at.
    const pages = req.file ? await byFile(req.file) : await search(req.search);
    const chosen = req.file
      ? (pages[0]?.imageinfo?.[0] ? { page: pages[0], info: pages[0].imageinfo[0] } : null)
      : pick(pages);
    if (!chosen) {
      const what = req.file ? `file "${req.file}"` : `"${req.search}"`;
      missing.push(`${req.key}: nothing usable for ${what}`);
      console.log(`  ✗ ${req.key} — no usable result for ${what}`);
      await sleep(500);
      continue;
    }

    const { page, info } = chosen;
    const meta = info.extmetadata ?? {};
    const file = `${req.key}.jpg`;
    await download(info.thumburl, new URL(file, DIR));

    manifest[req.key] = {
      file,
      search: req.search,
      title: page.title,
      // The scaled version we downloaded, not the original — that's what the
      // dimensions in the DB have to describe or every image lays out wrong.
      width: info.thumbwidth,
      height: info.thumbheight,
      author: plain(meta.Artist?.value) || "Unknown",
      license: plain(meta.LicenseShortName?.value) || "see Commons",
      source: info.descriptionurl,
    };
    writeFileSync(OUT, JSON.stringify(manifest, null, 2));

    console.log(
      `  ✓ ${req.key.padEnd(30)} ${page.title.replace(/^File:/, "").slice(0, 44)}`,
    );
    await sleep(500);
  }

  console.log(`\n  wrote photos.json — ${Object.keys(manifest).length} images`);
  if (missing.length) {
    console.log(`\n  ${missing.length} not found — edit the search term and re-run:`);
    for (const m of missing) console.log(`    ${m}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error("\nfetch-photos failed:", e.message ?? e);
  process.exit(1);
});
