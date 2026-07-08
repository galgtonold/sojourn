import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { triggerPostTranslation } from "@/lib/ai/translate";

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
