// @ts-check
// NOTE: deliberately no `#!/usr/bin/env node` line. Node strips a shebang when
// it *executes* a file but not when a bundler *imports* one, and Vite's loader
// rejects it outright — the tests below import this module, and adding the
// shebang back breaks them with a bare "SyntaxError: Invalid or unexpected
// token" pointing at the import rather than at the cause. It is only ever run
// as `node scripts/strip-prerender.mjs`, so it buys nothing.
//
// Throw away what `next build` prerendered, for the portable image only.
//
//   node scripts/strip-prerender.mjs [.next]
//
// A build inside the Docker image has no database — it cannot, because the
// image is meant to serve any deployment, and baking one deployment's data into
// it is the exact thing runtime config exists to avoid. So every page Next
// prerenders during that build is rendered against placeholder config: empty of
// content, carrying `https://build.invalid` as the Supabase URL the browser is
// told to use, and stamped with the build's own site name and site URL.
//
// Next then ships that HTML and serves it to the first visitor of each route,
// because stale-while-revalidate serves the stale copy first and regenerates
// behind it. Measured on a real instance: the first request to /posts returned
// "0 Geschichten" against a database holding 43 published posts, with the
// correct page appearing only on reload. /sitemap.xml and /robots.txt were
// worse — declared fully static, so they never regenerated at all and served
// http://localhost:3000 to every crawler, forever.
//
// Deleting the cached output leaves the route in the manifest and simply makes
// it a cache miss, which Next fills by rendering on demand. Verified: with the
// files removed, the very first request returns the full archive and no
// placeholder config.
//
// This runs ONLY in the Dockerfile. On Vercel the build has the real database,
// so its prerendering is correct and worth keeping.
import { readFileSync, readdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Where Next writes a route's prerendered output, minus the extension.
 *
 * The manifest names routes as URL paths; the cache names them as files, with
 * the site root as `index`. Exported for the tests, which is the only way to
 * check this mapping without a built app to point at.
 *
 * @param {string} route
 * @returns {string}
 */
export function cacheBasename(route) {
  if (route === "/") return "index";
  return route.replace(/^\//, "");
}

/**
 * Every prerendered file to discard: the pages Next will re-render anyway.
 *
 * A route with a numeric `initialRevalidateSeconds` is one Next already expects
 * to regenerate, so removing its build-time copy costs nothing but the first
 * render. A route with `false` is declared permanently static — if it also
 * depends on the database or the site URL, that is a bug in the route rather
 * than something to paper over here, so those are left alone and a test keeps
 * the data-backed ones from being declared that way.
 *
 * @param {{ routes?: Record<string, { initialRevalidateSeconds?: number | false }> }} manifest
 * @returns {string[]} file names relative to `.next/server/app`
 */
export function staleArtefacts(manifest) {
  /** @type {string[]} */
  const out = [];
  for (const [route, entry] of Object.entries(manifest.routes ?? {})) {
    if (typeof entry.initialRevalidateSeconds !== "number") continue;
    const base = cacheBasename(route);
    // Pages write .html/.rsc/.meta; route handlers (sitemap, robots) write
    // .body/.meta. Listing both is cheaper than deciding which kind it is.
    for (const ext of [".html", ".rsc", ".meta", ".body"]) out.push(base + ext);
  }
  return out;
}

/**
 * Strip one `.next` directory. Returns how many files went.
 *
 * @param {string} nextDir
 * @returns {number}
 */
function stripOne(nextDir) {
  const manifestPath = join(nextDir, "prerender-manifest.json");
  if (!existsSync(manifestPath)) return 0;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const appDir = join(nextDir, "server", "app");
  let removed = 0;
  for (const file of staleArtefacts(manifest)) {
    const path = join(appDir, file);
    if (!existsSync(path)) continue;
    rmSync(path, { force: true });
    removed++;
  }
  return removed;
}

/**
 * Any prerendered output still carrying the build's placeholder host.
 *
 * `.invalid` is reserved by RFC 2606 and can never resolve, so the Dockerfile
 * uses it as the Supabase URL to build against. Finding it in output that is
 * about to ship means that output was rendered against nothing — and this
 * script missed it.
 *
 * @param {string} dir
 * @returns {string[]}
 */
function survivingPlaceholders(dir) {
  /** @type {string[]} */
  const hits = [];
  if (!existsSync(dir)) return hits;
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    if (!/\.(html|body|rsc)$/.test(entry.name)) continue;
    const path = join(entry.parentPath ?? dir, entry.name);
    try {
      if (readFileSync(path, "utf8").includes(".invalid")) hits.push(path);
    } catch {
      /* unreadable is not evidence either way */
    }
  }
  return hits;
}

// ── the side-effecting half ──────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`.replace(/\\/g, "/")) {
  const nextDir = process.argv[2] ?? ".next";
  // `output: standalone` writes a SECOND copy of the server files, and that
  // copy — not this one — is what the runner stage ships. Stripping only the
  // first looks like it worked (25 files gone, build green) and changes nothing
  // a visitor sees. Both, therefore, and then a check that proves it.
  const dirs = [nextDir, join(nextDir, "standalone", ".next")];
  let removed = 0;
  for (const dir of dirs) removed += stripOne(dir);

  const survivors = dirs.flatMap((d) => survivingPlaceholders(join(d, "server", "app")));
  if (survivors.length > 0) {
    console.error(
      `strip-prerender: FAILED — ${survivors.length} prerendered file(s) still name the build's placeholder host, ` +
        `so this image would serve empty pages to the first visitor of each route:\n  ` +
        survivors.slice(0, 10).join("\n  "),
    );
    process.exit(1);
  }
  console.error(
    `strip-prerender: discarded ${removed} build-time file(s) — these routes now render on first request, against the deployment's own database`,
  );
}
