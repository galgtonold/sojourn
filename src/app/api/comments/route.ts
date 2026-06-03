import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getServerSupabase } from "@/lib/supabase/server";
import { notifyAdmin } from "@/lib/notify";
import { env } from "@/lib/env";

const schema = z.object({
  postId: z.string().min(1),
  authorName: z.string().trim().max(60).optional(),
  body: z.string().trim().min(1).max(4000),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const { postId, authorName, body } = parsed.data;

  // Prefer the anon client (RLS allows inserts); fall back to service role.
  const supabase = (await getServerSupabase()) ?? getAdminSupabase();
  if (!supabase) {
    // Demo mode: nothing to persist. The client keeps an optimistic copy.
    return NextResponse.json({ demo: true }, { status: 202 });
  }

  const { data, error } = await supabase
    .from("comments")
    .insert({ post_id: postId, author_name: authorName || "Anonymous", body })
    .select("id, post_id, parent_id, author_name, body, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Ping the admin (fire-and-forget).
  notifyAdmin({
    type: "comment",
    title: `New comment from ${data.author_name}`,
    body: body.slice(0, 120),
    url: `${env.siteUrl}/admin`,
  }).catch(() => {});

  return NextResponse.json(data, { status: 201 });
}
