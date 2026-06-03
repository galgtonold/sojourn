import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSupabase } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { REACTION_KINDS } from "@/lib/types";

const schema = z.object({
  postId: z.string().min(1),
  kind: z.enum(REACTION_KINDS as [string, ...string[]]),
  token: z.string().min(8).max(64),
  action: z.enum(["add", "remove"]),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const { postId, kind, token, action } = parsed.data;

  const supabase = (await getServerSupabase()) ?? getAdminSupabase();
  if (!supabase) return NextResponse.json({ demo: true }, { status: 202 });

  if (action === "add") {
    const { error } = await supabase
      .from("reactions")
      .upsert(
        { post_id: postId, kind, visitor_token: token },
        { onConflict: "post_id,kind,visitor_token", ignoreDuplicates: true },
      );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    const { error } = await supabase
      .from("reactions")
      .delete()
      .match({ post_id: postId, kind, visitor_token: token });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
