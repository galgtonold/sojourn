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

type Sub = { id: string; endpoint: string; p256dh: string; auth: string };

// Sends a push payload to a set of subscriptions, pruning dead ones.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deliver(supabase: any, subs: Sub[], payload: NotifyInput) {
  if (!subs.length) return;
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
  await deliver(supabase, (subs as Sub[]) ?? [], payload);
}

// New-comment alert: logs an in-app notification + pushes to the admins who may
// see this post — every owner, plus collaborators on the post's trip. A legacy
// admin subscription with no user_id (the owner's existing browser) hears all.
export async function notifyComment(
  postId: string,
  input: NotifyInput & { type: string },
) {
  const supabase = getAdminSupabase();
  if (supabase) {
    await supabase.from("notifications").insert({
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      url: input.url ?? null,
    });
  }
  ensureVapid();
  if (!isPushConfigured || !supabase) return;

  const allowed = new Set<string>();
  const { data: owners } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "owner");
  owners?.forEach((o: { id: string }) => allowed.add(o.id));
  const { data: post } = await supabase
    .from("posts")
    .select("trip_id")
    .eq("id", postId)
    .maybeSingle();
  if (post?.trip_id) {
    const { data: tm } = await supabase
      .from("trip_members")
      .select("user_id")
      .eq("trip_id", post.trip_id);
    tm?.forEach((m: { user_id: string | null }) => {
      if (m.user_id) allowed.add(m.user_id);
    });
  }

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, user_id")
    .eq("audience", "admin");
  const targets = ((subs as (Sub & { user_id: string | null })[]) ?? []).filter(
    (s) => s.user_id == null || allowed.has(s.user_id),
  );
  await deliver(supabase, targets, input);
}

// New-article alert: pushes to everyone who opted in as a viewer.
export async function notifyViewers(input: NotifyInput) {
  await fanOut("viewer", input);
}

// Reader-facing: push the author of `commentId` when their comment gets a reply
// or like. Resolves the owner via visitor_token → that reader's VIEWER push
// subscriptions. Never notifies the actor about their own comment, and no-ops
// silently when push is off, the comment is a pre-feature (token-less) row, or
// the owner has no subscription.
export async function notifyCommentAuthor(
  commentId: string,
  actorToken: string | null | undefined,
  event: { kind: "reply" | "like"; actorName?: string; bodyExcerpt?: string },
): Promise<void> {
  ensureVapid();
  if (!isPushConfigured) return;
  const supabase = getAdminSupabase();
  if (!supabase) return;

  const { data: comment } = await supabase
    .from("comments")
    .select("visitor_token, post_id")
    .eq("id", commentId)
    .maybeSingle();
  const owner = comment?.visitor_token as string | null | undefined;
  if (!owner) return; // pre-feature comment, or none
  if (actorToken && actorToken === owner) return; // no self-notification

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("audience", "viewer")
    .eq("visitor_token", owner);
  if (!subs?.length) return;

  const { data: post } = await supabase
    .from("posts")
    .select("slug, source_locale")
    .eq("id", comment!.post_id as string)
    .maybeSingle();
  const slug = (post?.slug as string) ?? "";
  const de = (post?.source_locale as string) !== "en";
  const title =
    event.kind === "reply"
      ? de
        ? `${event.actorName ?? "Jemand"} hat auf deinen Kommentar geantwortet`
        : `${event.actorName ?? "Someone"} replied to your comment`
      : de
        ? "Neuer Like für deinen Kommentar"
        : "New like on your comment";

  await deliver(supabase, subs as Sub[], {
    title,
    body: event.bodyExcerpt,
    url: `${env.siteUrl}/posts/${slug}#comment-${commentId}`,
  });
}
