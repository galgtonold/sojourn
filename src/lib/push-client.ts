"use client";
// Browser-side Web Push helpers, shared by the admin toggle and the viewer
// subscribe prompt.

import { visitorToken } from "@/lib/visitor";

export type PushAudience = "admin" | "viewer";

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

  const res = await fetch("/api/push", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...sub.toJSON(),
      audience,
      userAgent: navigator.userAgent,
      visitorToken: audience === "viewer" ? visitorToken() : undefined,
    }),
  });
  if (!res.ok) return { ok: false, reason: "store-failed" };
  return { ok: true };
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
}
