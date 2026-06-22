import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "node:crypto";
import { getAdminSupabase } from "@/lib/supabase/admin";

// Consume the invite token, called by the welcome page only AFTER the password
// has been set. Keeping the burn here (not at mint-time in /accept) means the
// link stays re-openable until onboarding actually succeeds, so an accidental
// open never strands the account. Public + token-gated like /accept.
const schema = z.object({ token: z.string().min(20) });

export async function POST(req: Request) {
  const admin = getAdminSupabase();
  if (!admin) {
    return NextResponse.json({ error: "unconfigured" }, { status: 503 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const tokenHash = createHash("sha256")
    .update(parsed.data.token)
    .digest("hex");

  await admin
    .from("member_invites")
    .update({ used_at: new Date().toISOString() })
    .eq("token", tokenHash)
    .is("used_at", null);

  return NextResponse.json({ ok: true });
}
