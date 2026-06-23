import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/lib/supabase/admin";

// Poll an async LLM job. Auth is enforced here; the row is read with the
// service role (the table is RLS-locked) and scoped to the requesting user.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await getServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = getAdminSupabase();
  if (!admin) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  const { data: job } = await admin
    .from("ai_jobs")
    .select("status, output, error, user_id, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!job || job.user_id !== user.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Reaper: a job still unfinished long past the longest allowed run (180s) was
  // almost certainly killed mid-flight (function timeout / edge crash). Mark it
  // errored so the client stops polling forever instead of spinning indefinitely.
  const STALE_MS = 4 * 60 * 1000;
  if (
    (job.status === "pending" || job.status === "running") &&
    job.created_at &&
    Date.now() - new Date(job.created_at).getTime() > STALE_MS
  ) {
    await admin
      .from("ai_jobs")
      .update({ status: "error", error: "timed out" })
      .eq("id", id);
    return NextResponse.json({ status: "error", output: null, error: "timed out" });
  }

  return NextResponse.json({
    status: job.status,
    output: job.output,
    error: job.error,
  });
}
