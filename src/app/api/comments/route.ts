import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSupabase } from "@/lib/supabase/server";
import { getPublicSupabase } from "@/lib/supabase/public";
import { COMMENT_SELECT, hydrateComment } from "@/lib/content";
import { notifyComment, notifyCommentAuthor } from "@/lib/notify";
import { afterResponse } from "@/lib/after-response";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

// GET /api/comments?postId=&limit= → fresh list (newest `limit`, returned
// chronologically) + total count, bypassing page-level ISR caching.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const postId = url.searchParams.get("postId");
  if (!postId) return NextResponse.json({ error: "missing postId" }, { status: 400 });
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 200, 1), 500);

  const supabase = getPublicSupabase();

  const { data, error, count } = await supabase
    .from("comments")
    .select(COMMENT_SELECT, { count: "exact" })
    .eq("post_id", postId)
    .eq("hidden", false)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    comments: (data ?? []).map(hydrateComment).reverse(),
    total: count ?? 0,
  });
}

const schema = z.object({
  postId: z.string().min(1),
  parentId: z.string().uuid().nullish(),
  authorName: z.string().trim().max(60).optional(),
  body: z.string().trim().min(1).max(4000),
  visitorToken: z.string().min(8).max(64).optional(),
});

export async function POST(req: Request) {
  if (!(await rateLimit(`comments:${clientIp(req)}`, 10, 60_000))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const { postId, parentId, authorName, body, visitorToken } = parsed.data;

  // Anonymous visitors get an unauthenticated anon client (RLS enforces the
  // insert policy); a signed-in admin/collaborator gets their session client.
  const supabase = await getServerSupabase();

  const { data, error } = await supabase
    .from("comments")
    .insert({
      post_id: postId,
      parent_id: parentId ?? null,
      author_name: authorName || "Anonymous",
      body,
      visitor_token: visitorToken ?? null,
    })
    .select("id, post_id, parent_id, author_name, body, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }

  // after(), not a floating promise — see @/lib/after-response. Left loose,
  // these are frozen with the response and usually never sent.
  afterResponse("notify.comment", () =>
    notifyComment(postId, {
      type: "comment",
      title: `New ${parentId ? "reply" : "comment"} from ${data.author_name}`,
      body: body.slice(0, 120),
      url: `${env.siteUrl}/admin/comments`,
    }),
  );

  if (parentId) {
    afterResponse("notify.reply", () =>
      notifyCommentAuthor(parentId, visitorToken, {
        kind: "reply",
        actorName: data.author_name,
        bodyExcerpt: body.slice(0, 120),
      }),
    );
  }

  return NextResponse.json({ ...data, like_count: 0 }, { status: 201 });
}
