import * as maplibregl from "maplibre-gl";

/**
 * MapLibre, with its Web Worker pointed somewhere that exists.
 *
 * **Import maplibre from here, never from `maplibre-gl` directly.** That is the
 * whole point of the file: the worker has to be configured exactly once, before
 * the first `new maplibregl.Map()`, and a component that imports the library
 * straight would build a map that silently renders nothing.
 *
 * maplibre 6 dropped the inlined worker that v4 built from a blob, and now loads
 * it from a sibling file whose location it derives from `import.meta.url`. Under
 * webpack that is not an http(s) URL, so its `defaultWorkerUrl()` returns `''`
 * and `new Worker('', {type: 'module'})` resolves against the document — the
 * browser fetches the PAGE, fails to parse HTML as a module, and the worker dies
 * before it handles a single tile.
 *
 * It fails without a sound: no exception, no console error, no failed request.
 * Vector tiles are fetched *by the worker*, so they simply never appear in the
 * network log, while raster tiles (main thread) keep arriving and make the map
 * look alive. The vector source never finishes loading, so `style.loaded()`
 * stays false, so **`map.on('load')` never fires** — and every source, layer and
 * marker in this app is added inside that handler. What the reader sees is a
 * basemap with nothing on it, or, above the relief layer's zoom 6 cap, nothing
 * at all.
 *
 * Diagnose it by watching the worker rather than the map: an empty URL passed to
 * `new Worker`, and a worker that closes immediately after being created.
 */
export const MAPLIBRE_WORKER_URL = `/maplibre/maplibre-gl-worker.mjs?v=${
  process.env.NEXT_PUBLIC_MAPLIBRE_VERSION ?? "dev"
}`;

// Same-origin and absolute, so the CSP's `worker-src 'self'` already covers it
// and no deployment has to know its own hostname. The file gets there via
// scripts/copy-maplibre-worker.mjs, which runs from `prebuild` and `predev`.
//
// The version query is not decoration. `public/` is served without a content
// hash, so on the next maplibre upgrade a browser holding the old worker would
// pair it with the new main bundle — a version-skew bug with no symptom anyone
// could trace back to a cache. The query makes that impossible.
maplibregl.setWorkerUrl(MAPLIBRE_WORKER_URL);

export * from "maplibre-gl";
