import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { requireOwner } from "@/lib/api/admin-auth";
import { mintInviteLink } from "@/lib/member-invite";

// Mint a fresh onboarding link for an existing account — so the owner can hand a
// collaborator a new password-set link (we have no email service), or re-issue
// an expired invite. Owner-only; the link goes through the same welcome flow.
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
