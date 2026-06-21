import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { env } from "@/lib/env";

// On-demand revalidation for the background `translate` Edge Function. The
// translation finishes a few seconds *after* publish — by then the static page
// was already rebuilt in its source language — so the function calls back here
// once the i18n columns are written, rebuilding the affected pages with the
// finished translation. Authenticated by the same shared secret the function
// already uses (it has no admin session), distinct from /api/admin/revalidate.
export async function POST(req: Request) {
  if (
    !env.edgeSharedSecret ||
    req.headers.get("x-edge-secret") !== env.edgeSharedSecret
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { paths } = (await req.json().catch(() => ({}))) as {
    paths?: unknown;
  };
  if (!Array.isArray(paths) || paths.length === 0) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  for (const path of paths) {
    if (typeof path === "string" && path.startsWith("/")) revalidatePath(path);
  }
  return NextResponse.json({ ok: true });
}
