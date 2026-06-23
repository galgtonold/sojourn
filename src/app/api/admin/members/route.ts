import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { requireOwner } from "@/lib/api/admin-auth";
import { mintInviteLink } from "@/lib/member-invite";

const schema = z.object({
  email: z.string().trim().email(),
  tripIds: z.array(z.string().uuid()).default([]),
});

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

  let userId: string | null = null;
  let status: "invited" | "granted" = "invited";

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
    // Create a confirmed account; we hand the owner a set-up link to share
    // (the built-in invite email can't be customised without custom SMTP).
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
        { error: created.error?.message ?? "Could not create user" },
        { status: 500 },
      );
    }
  }

  if (!userId) {
    return NextResponse.json({ error: "no-user" }, { status: 500 });
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

  // Our own 7-day invite token (Supabase's recovery links expire in ~1h). We
  // store only its hash; the raw token rides in the link and is exchanged for a
  // fresh Supabase session at click time (see /api/invite/accept).
  let link: string | undefined;
  if (status === "invited") {
    link = (await mintInviteLink(admin, userId, email)) ?? undefined;
  }

  // Hand back the member so the list can show them without a reload.
  return NextResponse.json({
    ok: true,
    status,
    link,
    member: { id: userId, email, tripIds },
  });
}
