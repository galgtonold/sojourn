import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoute, type AdminCtx } from "@/lib/api/admin-route";

// Persist the author's working context (ai_notes) on its own, so folding
// answered questions into it survives even if they never click Generate. RLS
// ensures the caller may edit this post.
const schema = z.object({
  postId: z.string().uuid(),
  notes: z.string().optional(),
});

export const POST = adminRoute(schema, saveNotes);

async function saveNotes({ supabase, input }: AdminCtx<z.infer<typeof schema>>) {
  const { error } = await supabase
    .from("posts")
    .update({ ai_notes: input.notes ?? null })
    .eq("id", input.postId);
  if (error) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return { ok: true };
}
