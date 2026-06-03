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

  const { path } = (await req.json().catch(() => ({}))) as { path?: string };
  if (!path || !path.startsWith("/")) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  revalidatePath(path);
  return NextResponse.json({ ok: true });
}
