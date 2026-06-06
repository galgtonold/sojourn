import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSupabase } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

const schema = z.object({
  email: z.string().trim().email(),
  tripIds: z.array(z.string().uuid()).default([]),
});

/** Confirms the caller is the owner. */
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

export async function POST(req: Request) {
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

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const email = parsed.data.email.toLowerCase();
  const { tripIds } = parsed.data;
  const redirectTo = `${env.siteUrl}/admin/welcome`;

  let userId: string | null = null;
  let status: "invited" | "granted" = "invited";
  let emailed = false;

  // Already a known user? Just (re)grant — they sign in normally.
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .maybeSingle();

  if (existing) {
    userId = existing.id;
    status = "granted";
  } else {
    // New user: try to send the invite email (works once the template is set
    // up); either way we create the account so we can hand back a working link.
    const inv = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
    if (!inv.error && inv.data?.user) {
      userId = inv.data.user.id;
      emailed = true;
    } else {
      const created = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
      });
      userId = created.data?.user?.id ?? null;
      if (!userId) {
        const { data: again } = await admin
          .from("profiles")
          .select("id")
          .ilike("email", email)
          .maybeSingle();
        userId = again?.id ?? null;
      }
      if (!userId) {
        return NextResponse.json(
          { error: inv.error?.message ?? "Could not create user" },
          { status: 500 },
        );
      }
    }
  }

  // Ensure a (member) profile exists — never downgrade an existing owner.
  await admin
    .from("profiles")
    .upsert(
      { id: userId, email, role: "member" },
      { onConflict: "id", ignoreDuplicates: true },
    );

  // Grant the trips.
  if (tripIds.length > 0) {
    await admin.from("trip_members").upsert(
      tripIds.map((trip_id) => ({ trip_id, user_id: userId })),
      { onConflict: "trip_id,user_id", ignoreDuplicates: true },
    );
  }

  // A direct set-password link that the welcome page verifies via token_hash —
  // works regardless of email templates / PKCE. Returned for new invitees so
  // the owner can always share it manually.
  let link: string | undefined;
  if (status === "invited") {
    const gen = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });
    const hashed = gen.data?.properties?.hashed_token;
    if (hashed) {
      link = `${env.siteUrl}/admin/welcome?token_hash=${hashed}&type=recovery`;
    }
  }

  return NextResponse.json({ ok: true, status, emailed, link });
}
