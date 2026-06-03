// Server-only: records an in-app notification and fans out Web Push to the
// relevant audience. No-ops gracefully when push/Supabase aren't set up.
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
  title: string;
  body?: string;
  url?: string;
};

// Sends a push payload to every subscription in an audience, pruning dead ones.
async function fanOut(
  audience: "admin" | "viewer",
  payload: NotifyInput,
): Promise<void> {
  ensureVapid();
  if (!isPushConfigured) return;
  const supabase = getAdminSupabase();
  if (!supabase) return;

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("audience", audience);
  if (!subs?.length) return;

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body ?? "",
    url: payload.url ?? "/",
  });

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
      } catch (err: unknown) {
        const code = (err as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", s.id);
        }
      }
    }),
  );
}

// Admin alert (e.g. new comment): logs an in-app notification + pushes to admin.
export async function notifyAdmin(input: NotifyInput & { type: string }) {
  const supabase = getAdminSupabase();
  if (supabase) {
    await supabase.from("notifications").insert({
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      url: input.url ?? null,
    });
  }
  await fanOut("admin", input);
}

// New-article alert: pushes to everyone who opted in as a viewer.
export async function notifyViewers(input: NotifyInput) {
  await fanOut("viewer", input);
}
