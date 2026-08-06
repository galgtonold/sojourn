#!/usr/bin/env node
// Put MapLibre's tile-parsing worker somewhere the browser can actually fetch it.
//
// Runs from `prebuild` and `predev`; also callable as `node scripts/copy-maplibre-worker.mjs`.
//
// maplibre-gl 6 is ESM-only and no longer inlines its Web Worker into the main
// bundle the way v4 did. It now loads the worker from a sibling file, and works
// out where that is like this (node_modules/maplibre-gl/src/util/web_worker.ts):
//
//     const moduleUrl = import.meta.url;
//     if (!/^https?:/.test(moduleUrl)) return '';
//
// Bundled by webpack, `import.meta.url` is not an http(s) URL, so that returns
// the empty string — and `workerFactory` hands it straight to
// `new Worker('', {type: 'module'})` without complaining. An empty specifier
// resolves against the document, so the browser fetches THE PAGE ITSELF, tries
// to parse the HTML as a module, and the worker dies on the spot.
//
// Nothing says so. There is no console error, no failed request, no exception.
// What you get is a map that draws its raster basemap (fetched on the main
// thread) and nothing else ever: no vector tiles, so the vector source never
// finishes loading, so `style.loaded()` stays false, so `map.on('load')` NEVER
// FIRES — and every marker, route and cluster this app adds lives inside that
// handler. On the trip maps, where the raster relief stops at zoom 6, the result
// is a blank rectangle.
//
// So the worker is copied into public/ and pointed at explicitly; see
// src/lib/maplibre.ts for the other half. Copied at build time rather than
// committed so it cannot drift from the installed version, and done here rather
// than with a webpack rule so it survives a switch to Turbopack.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);

/** Where the copies land, relative to `public/`. Must match src/lib/maplibre.ts. */
export const MAPLIBRE_PUBLIC_PATH = "/maplibre";

/**
 * The worker, plus the chunk it imports.
 *
 * `maplibre-gl-worker.mjs` is 19 KB and starts with a RELATIVE import of
 * `./maplibre-gl-shared.mjs` (480 KB). Copy only the first and the worker 404s
 * halfway through booting — which fails exactly as silently as the empty URL it
 * replaced. They have to travel together, into the same directory.
 */
const FILES = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

/** Absolute path of the directory this writes into, for tests. */
export const MAPLIBRE_WORKER_DIR = join(
  import.meta.dirname,
  "..",
  "public",
  MAPLIBRE_PUBLIC_PATH.slice(1),
);

/**
 * Copy the worker files into `<repoRoot>/public/maplibre/`.
 *
 * @param {string} repoRoot - directory holding `public/`, with a trailing separator tolerated
 * @returns {string[]} the files written
 */
export function copyMaplibreWorker(repoRoot) {
  const dist = dirname(require.resolve("maplibre-gl/package.json")) + "/dist";
  const version = JSON.parse(
    readFileSync(join(dirname(require.resolve("maplibre-gl/package.json")), "package.json"), "utf8"),
  ).version;
  const dest = join(repoRoot, "public", MAPLIBRE_PUBLIC_PATH.slice(1));

  // Cleared rather than overwritten, so a file that a past maplibre shipped and
  // this one does not cannot linger and be served to somebody.
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });

  const written = [];
  for (const file of FILES) {
    const from = join(dist, file);
    if (!existsSync(from)) {
      throw new Error(
        `maplibre-gl ${version} has no dist/${file}. The worker layout changed; ` +
          `check node_modules/maplibre-gl/src/util/web_worker.ts and update this script ` +
          `together with src/lib/maplibre.ts.`,
      );
    }
    copyFileSync(from, join(dest, file));
    written.push(file);
  }
  return written;
}

// Only when run directly, so importing this from a test copies nothing by surprise.
// `pathToFileURL` rather than interpolating into a `file://` string: on Windows
// the hand-built form is one slash short of what `import.meta.url` reports, so
// the comparison silently never matches and the script does nothing.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const written = copyMaplibreWorker(join(import.meta.dirname, ".."));
  console.log(`maplibre worker → public${MAPLIBRE_PUBLIC_PATH}/: ${written.join(", ")}`);
}
