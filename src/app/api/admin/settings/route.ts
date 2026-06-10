import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSupabase } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getViewer } from "@/lib/auth";

// Owner-only: persist the blog-wide writing-style guide. RLS has no client write
// policy, so the update goes through the service role behind the owner check.
export async function PUT(req: Request) {
  const supabase = await getServerSupabase();
  if (!supabase)
    return NextResponse.json({ error: "not configured" }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const viewer = await getViewer();
  if (!viewer.isOwner)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = z
    .object({ writing_style: z.string().max(8000) })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "invalid" }, { status: 400 });

  const admin = getAdminSupabase();
  if (!admin)
    return NextResponse.json({ error: "not configured" }, { status: 503 });

  const { error } = await admin
    .from("site_settings")
    .update({ writing_style: parsed.data.writing_style })
    .eq("id", 1);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
