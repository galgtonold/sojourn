import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSupabase } from "@/lib/supabase/server";
import { getPublicSupabase } from "@/lib/supabase/public";
import { summarizeReactions } from "@/lib/content";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { REACTION_KINDS } from "@/lib/types";

const schema = z.object({
  postId: z.string().min(1),
  kind: z.enum(REACTION_KINDS as [string, ...string[]]),
  token: z.string().min(8).max(64),
  action: z.enum(["add", "remove"]),
});

// Live reaction counts for a post. The post page bakes counts at build time, so
// they go stale between saves; the Reactions component refetches this on mount so
// a returning reader sees the current totals.
export async function GET(req: Request) {
  const postId = new URL(req.url).searchParams.get("postId");
  if (!postId) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const supabase = getPublicSupabase();

  const { data, error } = await supabase
    .from("reactions")
    .select("kind")
    .eq("post_id", postId);
  if (error) {
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }

  return NextResponse.json({ counts: summarizeReactions(data) });
}

export async function POST(req: Request) {
  if (!(await rateLimit(`reactions:${clientIp(req)}`, 40, 60_000))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const { postId, kind, token, action } = parsed.data;

  // Anon client for visitors (RLS enforces the insert policy); session client
  // when an admin is signed in.
  const supabase = await getServerSupabase();

  if (action === "add") {
    const { error } = await supabase
      .from("reactions")
      .upsert(
        { post_id: postId, kind, visitor_token: token },
        { onConflict: "post_id,kind,visitor_token", ignoreDuplicates: true },
      );
    if (error) {
      return NextResponse.json({ error: "unavailable" }, { status: 500 });
    }
  } else {
    // Through a security-definer function rather than a direct delete: anon no
    // longer holds DELETE on this table, because a policy permissive enough to
    // allow it was permissive enough to empty it (see migration 0046). The
    // function can only remove a row whose visitor_token matches.
    const { error } = await supabase.rpc("remove_reaction", {
      p_post_id: postId,
      p_kind: kind,
      p_token: token,
    });
    if (error) {
      return NextResponse.json({ error: "unavailable" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
