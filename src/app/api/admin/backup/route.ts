// Download everything portable about this instance as one ZIP.
//
// Owner only, and through `requireOwner`, which also refuses on the read-only
// demo deployment — an export walks every table with the service-role client,
// which is exactly the client RLS cannot hold back.
import { requireOwner } from "@/lib/api/admin-auth";
import { buildExport, ExportTooLarge } from "@/lib/backup/export";
import { exportFilename } from "@/lib/backup/manifest";

// Assembling the archive means reading every row and every photograph. That is
// nowhere near Vercel's default 60s on an instance with a few hundred pictures,
// and a killed function returns a truncated download rather than an error.
export const maxDuration = 300;
// Never cached, never prerendered: it is a snapshot of live data, and a cached
// export is a quietly stale one.
export const dynamic = "force-dynamic";

/**
 * Plain text, not JSON.
 *
 * This route is reached by a real download link, so whatever comes back is
 * handed to the browser rather than to code. JSON would be saved as a file the
 * reader then has to open to discover it is not their journal; text is shown.
 */
function problem(message: string, status: number): Response {
  return new Response(`${message}\n`, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export async function GET(): Promise<Response> {
  const gate = await requireOwner();
  if (!gate.ok) return problem("Not allowed.", gate.status);

  const at = new Date();
  try {
    const { zip, manifest } = await buildExport(at);
    console.log(
      `[export] ${zip.length} bytes — ` +
        `${Object.entries(manifest.tables).map(([t, n]) => `${t}:${n}`).join(" ")} ` +
        `photos:${manifest.photos.files}` +
        (manifest.photos.missing.length
          ? ` missing:${manifest.photos.missing.length}`
          : ""),
    );
    // Uint8Array rather than the Buffer itself: Buffer is a Node subclass, and
    // handing it straight to Response can serialise as an object on some
    // runtimes — a download that arrives as JSON-looking bytes.
    return new Response(new Uint8Array(zip), {
      headers: {
        "content-type": "application/zip",
        "content-length": String(zip.length),
        "content-disposition": `attachment; filename="${exportFilename(at)}"`,
        // It is the whole journal in one file; no cache should hold a copy.
        "cache-control": "no-store, private",
      },
    });
  } catch (e) {
    // 413, and the message names the tool that does handle this size.
    if (e instanceof ExportTooLarge) return problem(e.message, 413);
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[export] failed: ${message}`);
    return problem(
      "The export could not be built. The server log has the details.",
      500,
    );
  }
}
