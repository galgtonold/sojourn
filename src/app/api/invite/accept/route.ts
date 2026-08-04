import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "node:crypto";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { rateLimit, clientIp } from "@/lib/rate-limit";

// Public on purpose: the invitee isn't signed in yet, so this is gated entirely
// by the secret invite token (256 bits of entropy). It validates our own 7-day
// token, then mints a *fresh* short-lived Supabase recovery token to hand back —
// the welcome page verifies that into a session. So the week-long validity lives
// in our token, while Supabase's token is only ever seconds old when used.
//
// It deliberately does NOT consume the token here: the invitee only becomes
// usable once they set a password, so burning the token at mint-time (before the
// password is set) would strand the account with no password and a dead link.
// /api/invite/complete marks it used after the password is saved.
const schema = z.object({ token: z.string().min(20) });

export async function POST(req: Request) {
  // The token is 256 bits, so guessing it is not the threat — grinding is. This
  // endpoint mints a Supabase recovery token on every valid call and touches the
  // database on every invalid one, and until now it would do that as fast as
  // anyone could ask. Twenty attempts an hour is far more than an invitee
  // clicking a link in an email will ever need.
  if (!(await rateLimit(`invite-accept:${clientIp(req)}`, 20, 60 * 60_000))) {
    return NextResponse.json({ error: "rate-limited" }, { status: 429 });
  }
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

  const { data: invite } = await admin
    .from("member_invites")
    .select("email, expires_at, used_at")
    .eq("token", tokenHash)
    .maybeSingle();

  if (
    !invite ||
    invite.used_at ||
    new Date(invite.expires_at).getTime() < Date.now()
  ) {
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }

  const gen = await admin.auth.admin.generateLink({
    type: "recovery",
    email: invite.email,
    options: { redirectTo: `${env.siteUrl}/admin/welcome` },
  });
  const hashed = gen.data?.properties?.hashed_token;
  if (!hashed) {
    return NextResponse.json({ error: "mint-failed" }, { status: 500 });
  }

  return NextResponse.json({ token_hash: hashed, type: "recovery" });
}
