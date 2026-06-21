import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { triggerPostTranslation } from "@/lib/ai/translate";

// TEMPORARY: force a re-translation of every published post so the newly-added
// `location` field gets translated into the existing i18n. Remove afterwards.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const admin = getAdminSupabase();
  if (!admin) return NextResponse.json({ error: "no service role" });
  const { data: posts, error } = await admin
    .from("posts")
    .select("id")
    .eq("published", true);
  if (error) return NextResponse.json({ error: error.message });

  let triggered = 0;
  for (const p of posts ?? []) {
    await triggerPostTranslation(p.id, { force: true });
    triggered++;
  }
  return NextResponse.json({ triggered });
}
