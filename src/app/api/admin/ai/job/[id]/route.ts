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
    .select("status, output, error, user_id")
    .eq("id", id)
    .maybeSingle();
  if (!job || job.user_id !== user.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({
    status: job.status,
    output: job.output,
    error: job.error,
  });
}
