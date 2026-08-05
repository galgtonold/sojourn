import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase/server";

// Lets authenticated admin actions that write directly to Supabase from the
// browser (e.g. the gallery manager) refresh a cached public page on demand.
export async function POST(req: Request) {
  const supabase = await getServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "unconfigured" }, { status: 503 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // A session is not a permission (see @/lib/api/admin-route). Without this,
  // a loop over `/`, `/map` and every post slug evicts the ISR cache the whole
  // site's speed rests on, forcing full re-renders on demand — cheap for the
  // caller, expensive for a self-hosted box.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = (profile as { role?: string } | null)?.role;
  if (role !== "owner" && role !== "member") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { path } = (await req.json().catch(() => ({}))) as { path?: string };
  if (!path || !path.startsWith("/")) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  revalidatePath(path);
  return NextResponse.json({ ok: true });
}
