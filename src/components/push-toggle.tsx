"use client";
import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { env } from "@/lib/env";
import {
  getPushState,
  subscribeToPush,
  unsubscribeFromPush,
  type PushState,
} from "@/lib/push-client";
import { useT } from "@/components/i18n";

// Client-side, push availability depends ONLY on the public VAPID key — the
// private key is a server secret and is never present in the browser bundle.
const pushAvailable = Boolean(env.vapidPublicKey);

export function PushToggle() {
  const [state, setState] = useState<PushState>("default");
  const [busy, setBusy] = useState(false);
  const t = useT();

  useEffect(() => {
    getPushState().then(setState);
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const res = await subscribeToPush("admin", env.vapidPublicKey);
      setState(res.ok ? "subscribed" : res.reason === "denied" ? "denied" : "default");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      await unsubscribeFromPush();
      setState("default");
    } finally {
      setBusy(false);
    }
  }

  if (!pushAvailable) {
    return <p className="text-sm text-sand-100/50">{t("push.setKeys")}</p>;
  }
  if (state === "unsupported") {
    return <p className="text-sm text-sand-100/50">{t("push.unsupported")}</p>;
  }

  if (state === "subscribed") {
    return (
      <button
        onClick={disable}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-full border border-lagoon-500/40 bg-lagoon-500/10 px-4 py-2 text-sm text-lagoon-400 transition hover:bg-lagoon-500/20 disabled:opacity-50"
      >
        <BellRing className="size-4" /> {t("push.on")}
      </button>
    );
  }

  if (state === "denied") {
    return (
      <div className="space-y-1.5">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-sand-100/50">
          <BellOff className="size-4" /> {t("push.blocked")}
        </span>
        <p className="max-w-xs text-xs leading-relaxed text-sand-100/50">
          {t("push.blockedHelp")}
        </p>
      </div>
    );
  }

  return (
    <button
      onClick={enable}
      disabled={busy}
      className="inline-flex items-center gap-2 rounded-full bg-ember-500 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-ember-400 disabled:opacity-50"
    >
      <Bell className="size-4" /> {busy ? t("push.enabling") : t("push.enable")}
    </button>
  );
}
