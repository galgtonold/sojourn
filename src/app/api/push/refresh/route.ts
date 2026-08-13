import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { rateLimit, limitFor } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Does the server still hold this browser's subscription?
//
// getPushState() answers "subscribed" purely from the browser's own
// PushManager and never asks. So the switch can read ON while the stored row
// is gone — pruned after a 410, or left behind by a rotation the service
// worker never saw. Nothing notices until the reader happens to toggle it off
// and on, which is the only path that re-registers. That is exactly the
// "notifications stopped, then I fiddled with it and they came back" shape.
//
// Read-only about ownership, on purpose. It reports whether the endpoint is
// known and which audience it holds; it never creates a row and never edits
// one. The header bell lives in the root layout and therefore mounts on
// /admin too — if a refresh could carry an audience, loading an admin page
// would quietly demote the owner's admin subscription to viewer. Re-registering
// stays with /api/push, where the caller has said what it wants and, for
// admin, had to be signed in to say it.

const schema = z.object({ endpoint: z.string().url() });

export async function POST(req: Request) {
  // A read, and one every subscribed browser makes about once a day, so the
  // ceiling is higher than subscribing's — but still a ceiling, since this
  // takes an arbitrary endpoint and is reachable by anyone.
  const { ip, limit } = limitFor(req, 120);
  if (!(await rateLimit(`push-refresh:${ip}`, limit, 60 * 60_000))) {
    return NextResponse.json({ error: "rate-limited" }, { status: 429 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const admin = getAdminSupabase();
  if (!admin) {
    return NextResponse.json({ error: "unconfigured" }, { status: 503 });
  }

  const { data: existing } = await admin
    .from("push_subscriptions")
    .select("audience")
    .eq("endpoint", parsed.data.endpoint)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ known: false }, { status: 404 });
  }
  return NextResponse.json({ known: true, audience: existing.audience });
}
