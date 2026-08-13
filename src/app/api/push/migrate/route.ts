import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { rateLimit, limitFor } from "@/lib/rate-limit";
import { isAllowedPushEndpoint } from "@/lib/push-endpoint";

export const dynamic = "force-dynamic";

// Carry a subscription across a rotation.
//
// Browsers rotate a push subscription periodically, and revoke one when the
// user clears site data. The browser announces it by firing
// `pushsubscriptionchange` at the service worker (see public/sw.js). Before
// this route existed nobody listened, so the stored endpoint went on returning
// 410 and that device silently received nothing — for the reader, notifications
// that "worked for a while and then stopped", with nothing on the server to
// distinguish it from a quiet week.
//
// The worker cannot rebuild the record itself: audience, user_id and
// visitor_token live in localStorage or a session, and a service worker has
// access to neither. So it reports only which endpoint replaced which, and the
// record is carried across here.
//
// That is also what makes this safe. The caller cannot ASK for a subscription
// — there is no audience field to send — it can only move one that already
// exists, inheriting whatever that row already said. An unknown old endpoint
// is a 404 and writes nothing, so this is not a way to mint an admin
// subscription and start receiving someone else's comment alerts.

const schema = z.object({
  oldEndpoint: z.string().url(),
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
});

export async function POST(req: Request) {
  // Anonymous by necessity — a rotation happens without anyone being signed in
  // — so it needs the same ceiling as subscribing.
  const { ip, limit } = limitFor(req, 20);
  if (!(await rateLimit(`push-migrate:${ip}`, limit, 60 * 60_000))) {
    return NextResponse.json({ error: "rate-limited" }, { status: 429 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const { oldEndpoint, endpoint, keys } = parsed.data;

  // The same guard as /api/push: the sender POSTs to whatever ends up stored
  // here, from inside whatever network this server is on. Skipping it would
  // leave a way around that check rather than through it.
  if (!isAllowedPushEndpoint(endpoint)) {
    return NextResponse.json({ error: "invalid-endpoint" }, { status: 400 });
  }

  const admin = getAdminSupabase();
  if (!admin) {
    return NextResponse.json({ error: "unconfigured" }, { status: 503 });
  }

  const { data: existing } = await admin
    .from("push_subscriptions")
    .select("id")
    .eq("endpoint", oldEndpoint)
    .maybeSingle();

  if (!existing) {
    // Already migrated, or never ours. Either way there is nothing to move,
    // and creating a row from an unauthenticated request is exactly what this
    // route must never do.
    return NextResponse.json({ error: "unknown-subscription" }, { status: 404 });
  }

  // A repeat delivery of the same rotation would otherwise collide with the
  // unique endpoint. Clearing the destination first makes this idempotent.
  await admin.from("push_subscriptions").delete().eq("endpoint", endpoint);

  const { error } = await admin
    .from("push_subscriptions")
    .update({ endpoint, p256dh: keys.p256dh, auth: keys.auth })
    .eq("id", existing.id);

  if (error) return NextResponse.json({ error: "unavailable" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
