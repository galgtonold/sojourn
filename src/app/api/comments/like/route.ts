import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSupabase } from "@/lib/supabase/server";
import { rateLimit, limitFor } from "@/lib/rate-limit";
import { notifyCommentAuthor } from "@/lib/notify";
import { afterResponse } from "@/lib/after-response";

export const dynamic = "force-dynamic";

const schema = z.object({
  commentId: z.string().uuid(),
  token: z.string().min(8).max(64),
  action: z.enum(["add", "remove"]),
});

export async function POST(req: Request) {
  const { ip, limit } = limitFor(req, 60);
  if (!(await rateLimit(`like:${ip}`, limit, 60_000))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const { commentId, token, action } = parsed.data;

  const supabase = await getServerSupabase();

  if (action === "add") {
    // See 0048: anon no longer holds INSERT here, and the conflict target
    // names `visitor_token`, which anon can no longer read either.
    const { error } = await supabase.rpc("add_comment_like", {
      p_comment_id: commentId,
      p_token: token,
    });
    if (error) return NextResponse.json({ error: "unavailable" }, { status: 500 });
    // after(), not a floating promise — see @/lib/after-response.
    afterResponse("notify.like", () =>
      notifyCommentAuthor(commentId, token, { kind: "like" }),
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
