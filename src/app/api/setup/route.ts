import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { hasOwner } from "@/lib/setup";
import { getClaimWindow } from "@/lib/setup-window";
import { rateLimit, limitFor } from "@/lib/rate-limit";

// First-run claim of the owner account. Public by necessity — nobody can be
// signed in before the first account exists — and a permanent 410 tombstone the
// moment an owner row exists. The claim is atomic: profiles_single_owner_idx
// (migration 0038) allows at most one owner row, so of two concurrent claims
// exactly one promote succeeds; the loser lands in the 23505 branch below.
const schema = z.object({
  email: z.string().trim().email(),
  // 72 is bcrypt's input limit — longer passwords would be silently truncated.
  password: z.string().min(8).max(72),
});

export async function POST(req: Request) {
  const { ip, limit } = limitFor(req, 5);
  if (!(await rateLimit(`setup:${ip}`, limit, 10 * 60_000))) {
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
  const email = parsed.data.email.toLowerCase();
  const { password } = parsed.data;

  const owned = await hasOwner(admin);
  if (owned === null) {
    return NextResponse.json({ error: "lookup-failed" }, { status: 500 });
  }
  if (owned) {
    return NextResponse.json({ error: "owner-exists" }, { status: 410 });
  }

  // Checked after ownership so a claimed install reports the useful answer
  // ("already set up") rather than an expiry that no longer matters.
  if ((await getClaimWindow()) === "expired") {
    return NextResponse.json(
      { error: "setup-window-expired" },
      { status: 403 },
    );
  }

  let userId: string;
  let created = false;
  const res = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (res.data?.user?.id) {
    userId = res.data.user.id;
    created = true;
  } else if (
    res.error?.code === "email_exists" ||
    /already (been )?registered/i.test(res.error?.message ?? "")
  ) {
    // Self-heal: a passwordful account without any owner is exactly the
    // crash-mid-setup state (created, then the promote failed). In the
    // zero-owner state the instance is claimable wholesale anyway, so taking
    // the account over adds no exposure beyond the documented model.
    const { data: existing } = await admin
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();
    const existingId = (existing as { id?: string } | null)?.id;
    if (!existingId) {
      return NextResponse.json({ error: "email-taken" }, { status: 409 });
    }
    const upd = await admin.auth.admin.updateUserById(existingId, {
      password,
      email_confirm: true,
    });
    if (upd.error) {
      return NextResponse.json({ error: upd.error.message }, { status: 500 });
    }
    userId = existingId;
  } else {
    return NextResponse.json(
      { error: res.error?.message ?? "create-failed" },
      { status: 500 },
    );
  }

  const { error: promoteError } = await admin
    .from("profiles")
    .upsert({ id: userId, email, role: "owner" }, { onConflict: "id" });
  if (promoteError) {
    // Undo only what this request created — never a pre-existing account.
    if (created) await admin.auth.admin.deleteUser(userId);
    if (promoteError.code === "23505") {
      return NextResponse.json({ error: "owner-exists" }, { status: 410 });
    }
    return NextResponse.json({ error: promoteError.message }, { status: 500 });
  }

  // A reclaim — say, after deleting someone who got here first — must not
  // inherit their AI provider config. `app_secrets` survives deleting the user
  // that wrote it (updated_by is ON DELETE SET NULL), and the provider base
  // URLs are free-form, so a stale one would keep receiving drafted content.
  await admin.from("app_secrets").delete().neq("key", "");

  return NextResponse.json({ ok: true });
}
