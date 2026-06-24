import { NextResponse } from "next/server";
import { getPublicSupabase } from "@/lib/supabase/public";

// Liveness + dependency check for an external uptime monitor (e.g. UptimeRobot).
// Public and unauthenticated, deliberately tiny, and never cached: it returns
// 200 only when the app AND its database are reachable, and 503 when the DB
// probe fails or times out — so a monitor alerts on a real outage, not just
// "the HTML loaded". The version (deploy commit) rides along so you can confirm
// at a glance which build is actually live.
export const dynamic = "force-dynamic";

const VERSION = process.env.NEXT_PUBLIC_SW_VERSION ?? "dev";
const DB_TIMEOUT_MS = 3000;

export async function GET() {
  const started = Date.now();
  let db: "ok" | "down" = "down";

  try {
    // A tiny, RLS-safe probe: HEAD/count on a public table. Any non-error
    // response means Supabase is reachable; the row count is irrelevant.
    const probe = getPublicSupabase()
      .from("posts")
      .select("id", { head: true, count: "exact" })
      .limit(1);
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), DB_TIMEOUT_MS),
    );
    const { error } = (await Promise.race([probe, timeout])) as {
      error: unknown;
    };
    if (!error) db = "ok";
  } catch {
    db = "down";
  }

  const ok = db === "ok";
  return NextResponse.json(
    { status: ok ? "ok" : "degraded", db, version: VERSION, ms: Date.now() - started },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
