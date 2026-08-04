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

  await triggerPostTranslation(id, { force: true });

  const { data } = await supabase
    .from("posts")
    .select("translation_status")
    .eq("id", id)
    .maybeSingle();
  return NextResponse.json({ status: data?.translation_status ?? "pending" });
}
