"use client";
// Browser-side Web Push helpers, shared by the admin toggle and the viewer
// subscribe prompt.

import { visitorToken } from "@/lib/visitor";
import {
  shouldResync,
  rememberedAudience,
  syncRecord,
  type PushAudience,
} from "@/lib/push-sync";

export type { PushAudience };

const SYNC_KEY = "sojourn:push-synced";

export type PushState =
  | "unsupported"
  | "default"
  | "granted"
  | "denied"
  | "subscribed";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) return "subscribed";
  } catch {
    // ignore
  }
  return Notification.permission as PushState;
}

/**
 * Subscribe the current browser to push for `audience`.
 *
 * IMPORTANT: we call `Notification.requestPermission()` first, synchronously
 * within the user gesture, BEFORE any async service-worker work. Registering
 * the SW first (an await) can detach the permission request from the gesture
 * and cause some browsers to auto-block without ever showing a prompt.
 */
export async function subscribeToPush(
  audience: PushAudience,
  vapidPublicKey: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (!pushSupported()) return { ok: false, reason: "unsupported" };
  if (!vapidPublicKey) return { ok: false, reason: "no-key" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: permission };

  // Reuse the worker the page already registered (it carries a per-build query),
  // so we don't register a second, unversioned /sw.js alongside it.
  const reg =
    (await navigator.serviceWorker.getRegistration()) ??
    (await navigator.serviceWorker.register("/sw.js"));
  await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
    });
  }

  const res = await storeSubscription(sub, audience);
  if (!res.ok) return { ok: false, reason: "store-failed" };
  // Remember what this browser subscribed AS, so a later rotation or a pruned
  // row can be repaired without guessing.
  remember(sub.endpoint, audience);
  return { ok: true };
}

/** Hand a subscription to the server as `audience`. */
function storeSubscription(sub: PushSubscription, audience: PushAudience) {
  return fetch("/api/push", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...sub.toJSON(),
      audience,
      userAgent: navigator.userAgent,
      visitorToken: audience === "viewer" ? visitorToken() : undefined,
    }),
  });
}

function remember(endpoint: string, audience: PushAudience | null) {
  try {
    localStorage.setItem(SYNC_KEY, syncRecord(endpoint, Date.now(), audience));
  } catch {
    // Private mode, or storage full. Costs a redundant check next load.
  }
}

// Only one of these at a time: the bell and the subscribe prompt can both be
// on screen, and there is no reason for them to ask the same question twice.
let checking: Promise<void> | null = null;

/**
 * Make sure the server still holds this browser's subscription.
 *
 * `getPushState()` answers from the browser's own PushManager, so the control
 * reads "on" even after the stored row is pruned by a 410 or orphaned by a
 * rotation — and the only thing that ever repaired it was the reader toggling
 * it off and on. This closes that by checking in about once a day, and
 * immediately whenever the endpoint has changed.
 *
 * Takes no audience on purpose. A browser holds exactly one subscription, so
 * the audience belongs to the browser, not to whichever control happened to
 * mount — and the bell is in the root layout, so it mounts on /admin too.
 * Letting it supply an audience would mean loading a public page could demote
 * the owner's admin subscription to viewer.
 */
export async function ensureSubscriptionLive(): Promise<void> {
  if (!pushSupported()) return;
  if (Notification.permission !== "granted") return;
  if (checking) return checking;
  checking = runCheck().finally(() => {
    checking = null;
  });
  return checking;
}

async function runCheck(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    // Nothing subscribed in this browser: there is nothing to keep alive, and
    // subscribing uninvited is not this function's job.
    if (!sub) return;

    const raw = localStorage.getItem(SYNC_KEY);
    if (!shouldResync(raw, sub.endpoint, Date.now())) return;

    const res = await fetch("/api/push/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });

    if (res.ok) {
      // Still known. Record what the server says it is, which also teaches
      // this browser its audience for the first time if it subscribed before
      // any of this existed.
      const data = (await res.json()) as { audience?: PushAudience };
      remember(sub.endpoint, data.audience ?? rememberedAudience(raw));
      return;
    }

    if (res.status !== 404) return; // rate limited, offline, server trouble

    // The server has lost this subscription. Re-register it as whatever this
    // browser subscribed as — never as a guess. A browser that subscribed
    // before any of this existed has nothing recorded yet, and is left for an
    // explicit toggle: the successful branch above records the audience the
    // server reports, so every still-live subscription learns its own within a
    // day and can self-heal from then on.
    const audience = rememberedAudience(raw);
    if (!audience) return;

    const stored = await storeSubscription(sub, audience);
    if (stored.ok) remember(sub.endpoint, audience);
  } catch {
    // Offline, or the worker is not ready. The next page load tries again.
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await fetch("/api/push", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  });
  await sub.unsubscribe();
  // Deliberately off: leaving the record behind would let the next page load
  // helpfully re-register the subscription the reader just turned off.
  try {
    localStorage.removeItem(SYNC_KEY);
  } catch {
    /* private mode */
  }
}
