import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getWorkerUrl } from "maplibre-gl";
import { MAPLIBRE_WORKER_DIR, copyMaplibreWorker } from "../../scripts/copy-maplibre-worker.mjs";
import { MAPLIBRE_WORKER_URL } from "@/lib/maplibre";

const repo = fileURLToPath(new URL("../..", import.meta.url));

/**
 * maplibre 6 is ESM-only and loads its tile-parsing worker from a separate
 * file. Bundled by webpack, its own `defaultWorkerUrl()` gives up (import.meta.url
 * is not an http(s) URL) and returns "" — and `new Worker("")` resolves to the
 * PAGE, so the worker dies parsing HTML and no vector tile is ever parsed. The
 * map then draws a basemap with nothing on it and never fires `load`.
 *
 * So two things have to stay true, and neither is visible from the other's file:
 * the client has to be told where the worker is, and the build has to actually
 * put it there.
 */
describe("the maplibre worker is reachable", () => {
  it("configures a worker url rather than leaving maplibre to guess", async () => {
    await import("@/lib/maplibre");
    expect(getWorkerUrl()).toBeTruthy();
    expect(getWorkerUrl()).toContain("maplibre-gl-worker.mjs");
  });

  it("serves it from the site's own origin, so worker-src 'self' covers it", async () => {
    await import("@/lib/maplibre");
    expect(getWorkerUrl().startsWith("/")).toBe(true);
  });

  it("copies a file to exactly the path the client asks for", () => {
    const copied = copyMaplibreWorker(repo);
    expect(copied.length).toBeGreaterThanOrEqual(2);

    // The URL the browser will request, mapped back onto what the build wrote.
    const path = MAPLIBRE_WORKER_URL.split("?")[0];
    expect(existsSync(`${repo}public${path}`)).toBe(true);

    // The worker imports the shared chunk with a RELATIVE specifier, so that
    // file has to sit next to it or the worker 404s halfway through booting.
    expect(existsSync(`${MAPLIBRE_WORKER_DIR}/maplibre-gl-shared.mjs`)).toBe(true);
  });
});
