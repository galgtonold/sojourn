import { NextResponse } from "next/server";
import { z } from "zod";
import { ownerRoute } from "@/lib/api/owner-route";
import { mintInviteLink } from "@/lib/member-invite";

// Mint a fresh onboarding link for an existing account — so the owner can hand a
// collaborator a new password-set link (we have no email service), or re-issue
// an expired invite. Owner-only; the link goes through the same welcome flow.
export const POST = ownerRoute(z.unknown(), async ({ admin, params }) => {
  const id = params.id;
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
  return { ok: true, link };
});
