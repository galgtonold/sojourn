import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getServerSupabase } from "@/lib/supabase/server";
import { getPublicSupabase } from "@/lib/supabase/public";
import { notifyAdmin } from "@/lib/notify";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

const COMMENT_SELECT =
  "id, post_id, parent_id, author_name, body, created_at, comment_likes(count)";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hydrate(row: any) {
  return {
    id: row.id,
    post_id: row.post_id,
    parent_id: row.parent_id,
    author_name: row.author_name,
    body: row.body,
    created_at: row.created_at,
    like_count: row.comment_likes?.[0]?.count ?? 0,
  };
}

// GET /api/comments?postId=… → fresh threaded list, bypassing page-level ISR.
export async function GET(req: Request) {
  const postId = new URL(req.url).searchParams.get("postId");
  if (!postId) return NextResponse.json({ error: "missing postId" }, { status: 400 });

  const supabase = getPublicSupabase();
  if (!supabase) return NextResponse.json({ comments: [] });

  const { data, error } = await supabase
    .from("comments")
    .select(COMMENT_SELECT)
    .eq("post_id", postId)
    .eq("hidden", false)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comments: (data ?? []).map(hydrate) });
}

const schema = z.object({
  postId: z.string().min(1),
  parentId: z.string().uuid().nullish(),
  authorName: z.string().trim().max(60).optional(),
  body: z.string().trim().min(1).max(4000),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const { postId, parentId, authorName, body } = parsed.data;

  const supabase = (await getServerSupabase()) ?? getAdminSupabase();
  if (!supabase) {
    return NextResponse.json({ demo: true }, { status: 202 });
  }

  const { data, error } = await supabase
    .from("comments")
    .insert({
      post_id: postId,
      parent_id: parentId ?? null,
      author_name: authorName || "Anonymous",
      body,
    })
    .select("id, post_id, parent_id, author_name, body, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  notifyAdmin({
    type: "comment",
    title: `New ${parentId ? "reply" : "comment"} from ${data.author_name}`,
    body: body.slice(0, 120),
    url: `${env.siteUrl}/admin/comments`,
  }).catch(() => {});

  return NextResponse.json({ ...data, like_count: 0 }, { status: 201 });
}
