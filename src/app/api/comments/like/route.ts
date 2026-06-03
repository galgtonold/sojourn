import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSupabase } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const schema = z.object({
  commentId: z.string().uuid(),
  token: z.string().min(8).max(64),
  action: z.enum(["add", "remove"]),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const { commentId, token, action } = parsed.data;

  const supabase = (await getServerSupabase()) ?? getAdminSupabase();
  if (!supabase) return NextResponse.json({ demo: true }, { status: 202 });

  if (action === "add") {
    const { error } = await supabase
      .from("comment_likes")
      .upsert(
        { comment_id: commentId, visitor_token: token },
        { onConflict: "comment_id,visitor_token", ignoreDuplicates: true },
      );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await supabase
      .from("comment_likes")
      .delete()
      .match({ comment_id: commentId, visitor_token: token });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
