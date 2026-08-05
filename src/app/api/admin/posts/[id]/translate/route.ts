import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { triggerPostTranslation } from "@/lib/ai/translate";

// Translation runs in-process when no Edge Function is configured (see
// @/lib/ai/translate), scheduled with `after()` — so the model calls are billed
// against THIS function's clock even though the response has already gone. The
// body pass is capped at 8000 tokens, which does not fit in Vercel's default 60s
// and a killed function records nothing at all. Raising a cap and raising the
// route's clock are one decision (CLAUDE.md).
export const maxDuration = 180;


// Read the current translation status (for the editor to poll while it runs).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await getServerSupabase();
  if (!supabase)
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("posts")
    .select("translation_status, source_locale, translation_error")
    .eq("id", id)
    .maybeSingle();
  return NextResponse.json({
    status: data?.translation_status ?? "none",
    source_locale: data?.source_locale ?? null,
    error: data?.translation_error ?? null,
  });
}

// Force a re-translation of this post.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await getServerSupabase();
  if (!supabase)
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // A session is not a permission — and here it was the only question asked.
  //
  // Everything below runs through getAdminSupabase(), the service-role client
  // RLS cannot hold back, and `force: true` skips the "already translated"
  // early return every time. So any holder of any Supabase session could spend
  // the operator's provider key on an unbounded number of 8000-token runs, and
  // a collaborator granted one trip could force translation of the owner's
  // unpublished drafts in trips they were never given.
  //
  // The proof is an UPDATE through the RLS client, not a SELECT: `read
  // published posts` lets anyone read a published row, so reading one proves
  // nothing. The posts UPDATE policy is `is_owner() or can_edit_post(id)`, so a
  // row coming back is the database itself confirming this caller may edit this
  // post. A session with no profile satisfies neither branch and gets the same
  // 403 as a member reaching outside their trips.
  //
  // Setting `pending` is not a side effect invented for the check —
  // triggerPostTranslation sets exactly this a moment later.
  const { data: permitted, error: permitError } = await supabase
    .from("posts")
    .update({ translation_status: "pending" })
    .eq("id", id)
    .select("id");
  if (permitError)
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  if (!permitted?.length)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  await triggerPostTranslation(id, { force: true });

  const { data } = await supabase
    .from("posts")
    .select("translation_status")
    .eq("id", id)
    .maybeSingle();
  return NextResponse.json({ status: data?.translation_status ?? "pending" });
}
