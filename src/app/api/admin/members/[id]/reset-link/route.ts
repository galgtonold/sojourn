import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { mintInviteLink } from "@/lib/member-invite";

// Mint a fresh onboarding link for an existing account — so the owner can hand a
// collaborator a new password-set link (we have no email service), or re-issue
// an expired invite. Owner-only; the link goes through the same welcome flow.
async function requireOwner() {
  const supabase = await getServerSupabase();
  if (!supabase) return { ok: false as const, status: 503 };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401 };
  const { data: prof } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (prof?.role !== "owner") return { ok: false as const, status: 403 };
  return { ok: true as const };
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireOwner();
  if (!gate.ok) {
    return NextResponse.json({ error: "forbidden" }, { status: gate.status });
  }
  const admin = getAdminSupabase();
  if (!admin) {
    return NextResponse.json(
      { error: "Service role key not configured" },
      { status: 503 },
    );
  }
  const { id } = await params;
  const { data: prof } = await admin
    .from("profiles")
    .select("email")
    .eq("id", id)
    .maybeSingle();
  if (!prof?.email) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }
  const link = await mintInviteLink(admin, id, prof.email);
  if (!link) {
    return NextResponse.json({ error: "mint-failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, link });
}
