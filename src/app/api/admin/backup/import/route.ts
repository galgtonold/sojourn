// Load an export into an instance that has nothing in it.
//
// Owner only, and refuses outright unless the instance is empty — see
// @/lib/backup/import for why that restriction is the safety model rather than
// a limitation waiting to be lifted.
import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/api/admin-auth";
import { runImport, ImportRefused } from "@/lib/backup/import";

// Inserting every row and uploading every photograph. Same reasoning as the
// export side, and a killed function here leaves a half-filled database.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// A ceiling on what we will read into memory before even looking at it, so an
// unauthenticated-shaped mistake or a wrong file cannot exhaust the box. Matches
// the export's own limit; anything larger belongs to scripts/restore.sh.
const MAX_UPLOAD_BYTES = 250 * 1024 * 1024;

export async function POST(req: Request): Promise<Response> {
  const gate = await requireOwner();
  if (!gate.ok) {
    return NextResponse.json({ error: "forbidden" }, { status: gate.status });
  }

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        error:
          `That file is larger than this import can hold in memory. ` +
          `Use scripts/restore.sh on the machine itself.`,
      },
      { status: 413 },
    );
  }

  let archive: Buffer;
  try {
    const form = await req.formData();
    const file = form.get("archive");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "no file uploaded" }, { status: 400 });
    }
    const bytes = await file.arrayBuffer();
    // Re-checked after reading: content-length is a claim, not a measurement.
    if (bytes.byteLength > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "file too large" }, { status: 413 });
    }
    archive = Buffer.from(bytes);
  } catch {
    return NextResponse.json({ error: "could not read the upload" }, { status: 400 });
  }

  try {
    const result = await runImport(archive);
    console.log(
      `[import] from ${result.from?.siteName} (${result.from?.sojournVersion}) — ` +
        Object.entries(result.tables)
          .map(([t, n]) => `${t}:${n}`)
          .join(" ") +
        ` photos:${result.photos}` +
        (result.photosFailed.length ? ` failed:${result.photosFailed.length}` : ""),
    );
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof ImportRefused) {
      // These messages are written to be read by the person holding the file.
      console.warn(`[import] refused (${e.status}): ${e.message}`);
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[import] failed: ${message}`);
    return NextResponse.json({ error: "import failed" }, { status: 500 });
  }
}
