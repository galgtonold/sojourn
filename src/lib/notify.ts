// Server-only: records an in-app notification and fans it out to the admin's
// Web Push subscriptions. No-ops gracefully when push/Supabase aren't set up.
import "server-only";
import webpush from "web-push";
import { env, isPushConfigured } from "@/lib/env";
import { getAdminSupabase } from "@/lib/supabase/admin";

let configured = false;
function ensureVapid() {
  if (configured || !isPushConfigured) return;
  webpush.setVapidDetails(
    env.vapidSubject,
    env.vapidPublicKey,
    env.vapidPrivateKey,
  );
  configured = true;
}

export type NotifyInput = {
  type: string;
  title: string;
  body?: string;
  url?: string;
};

export async function notifyAdmin(input: NotifyInput): Promise<void> {
  const supabase = getAdminSupabase();
  if (!supabase) return;

  // 1. Persist the in-app notification (best effort).
  await supabase.from("notifications").insert({
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    url: input.url ?? null,
  });

  // 2. Web Push fan-out.
  ensureVapid();
  if (!isPushConfigured) return;

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth");
  if (!subs?.length) return;

  const payload = JSON.stringify({
    title: input.title,
    body: input.body ?? "",
    url: input.url ?? "/",
  });

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        );
      } catch (err: unknown) {
        // 404/410 → subscription is dead; prune it.
        const code = (err as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", s.id);
        }
      }
    }),
  );
}
