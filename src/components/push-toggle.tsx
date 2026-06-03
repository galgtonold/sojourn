"use client";
import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { env, isPushConfigured } from "@/lib/env";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

type State = "unsupported" | "default" | "granted" | "denied" | "subscribed";

export function PushToggle() {
  const [state, setState] = useState<State>("default");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return;
    }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(sub ? "subscribed" : Notification.permission as State))
      .catch(() => setState(Notification.permission as State));
  }, []);

  async function enable() {
    if (!isPushConfigured) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          env.vapidPublicKey,
        ) as BufferSource,
      });
      await fetch("/api/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...sub.toJSON(), userAgent: navigator.userAgent }),
      });
      setState("subscribed");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("default");
    } finally {
      setBusy(false);
    }
  }

  if (!isPushConfigured) {
    return (
      <p className="text-sm text-sand-100/50">
        Set VAPID keys to enable push notifications.
      </p>
    );
  }
  if (state === "unsupported") {
    return <p className="text-sm text-sand-100/50">Push not supported here.</p>;
  }

  if (state === "subscribed") {
    return (
      <button
        onClick={disable}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-full border border-lagoon-500/40 bg-lagoon-500/10 px-4 py-2 text-sm text-lagoon-400 transition hover:bg-lagoon-500/20 disabled:opacity-50"
      >
        <BellRing className="size-4" /> Notifications on
      </button>
    );
  }

  return (
    <button
      onClick={enable}
      disabled={busy || state === "denied"}
      className="inline-flex items-center gap-2 rounded-full bg-ember-500 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-ember-400 disabled:opacity-50"
    >
      {state === "denied" ? (
        <>
          <BellOff className="size-4" /> Blocked in browser
        </>
      ) : (
        <>
          <Bell className="size-4" /> Enable notifications
        </>
      )}
    </button>
  );
}
