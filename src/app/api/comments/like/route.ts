import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSupabase } from "@/lib/supabase/server";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { notifyCommentAuthor } from "@/lib/notify";
import { logError } from "@/lib/log";

export const dynamic = "force-dynamic";

const schema = z.object({
  commentId: z.string().uuid(),
  token: z.string().min(8).max(64),
  action: z.enum(["add", "remove"]),
});

export async function POST(req: Request) {
  if (!(await rateLimit(`like:${clientIp(req)}`, 60, 60_000))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const { commentId, token, action } = parsed.data;

  const supabase = await getServerSupabase();

  if (action === "add") {
    const { error } = await supabase
      .from("comment_likes")
      .upsert(
        { comment_id: commentId, visitor_token: token },
        { onConflict: "comment_id,visitor_token", ignoreDuplicates: true },
      );
    if (error) return NextResponse.json({ error: "unavailable" }, { status: 500 });
    notifyCommentAuthor(commentId, token, { kind: "like" }).catch((e) =>
      logError("notify.like", e),
    );
  } else {
    // See migration 0046 — anon no longer holds DELETE here, and the function
    // can only remove a like whose visitor_token matches.
    const { error } = await supabase.rpc("remove_comment_like", {
      p_comment_id: commentId,
      p_token: token,
    });
    if (error) return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
