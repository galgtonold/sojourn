import { revalidatePostPage } from "@/lib/revalidate-post";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Moderation runs through the server (fresh, cookie-backed session) rather than
// the long-lived browser client whose token can go stale — and RLS still gates
// it: a collaborator may only touch comments on posts in their trips. We confirm
// a row was actually affected so an RLS denial surfaces as a 403, not a silent
// no-op the UI mistakes for success.

async function requireUser() {
  const supabase = await getServerSupabase();
  if (!supabase) return { supabase: null, user: null };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

const patchSchema = z.object({ hidden: z.boolean() });

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  if (!supabase)
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "invalid" }, { status: 400 });

  const { data, error } = await supabase
    .from("comments")
    .update({ hidden: parsed.data.hidden })
    .eq("id", id)
    .select("id");
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await revalidatePostPage(supabase, { commentId: id });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  if (!supabase)
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Read the post BEFORE the delete — afterwards there is no row to find it
  // from, which is the same trap the photo objects fell into.
  const { data: owner } = await supabase
    .from("comments")
    .select("post_id")
    .eq("id", id)
    .maybeSingle();

  // Replies cascade at the DB level; the returned row is the parent we matched.
  const { data, error } = await supabase
    .from("comments")
    .delete()
    .eq("id", id)
    .select("id");
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const postId = (owner as { post_id?: string } | null)?.post_id;
  if (postId) await revalidatePostPage(supabase, { postId });
  return NextResponse.json({ ok: true });
}
