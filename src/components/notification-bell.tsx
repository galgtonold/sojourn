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
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n";

// Push availability depends only on the public VAPID key in the browser.
const pushAvailable = Boolean(env.vapidPublicKey);

/**
 * Always-available notification toggle for readers — so someone who dismissed
 * the one-time subscribe prompt can still turn notifications on (or off) later.
 * A click subscribes ("viewer" audience) or unsubscribes; when the browser has
 * blocked notifications it shows a disabled bell with a how-to-unblock tooltip.
 * Renders nothing where push can't work, so it never clutters the header.
 */
export function NotificationBell({
  className = "size-9",
  iconClassName = "size-4",
}: {
  className?: string;
  iconClassName?: string;
}) {
  const t = useT();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (pushAvailable) getPushState().then(setState);
  }, []);

  if (!pushAvailable || state === null || state === "unsupported") return null;

  const subscribed = state === "subscribed";
  const denied = state === "denied";
  const Icon = subscribed ? BellRing : denied ? BellOff : Bell;
  const status = denied
    ? t("push.blocked")
    : subscribed
      ? t("push.on")
      : t("push.enable");
  const hint = denied ? t("push.blockedHelp") : `${t("push.viewer")} — ${status}`;

  async function toggle() {
    if (busy || denied) return;
    setBusy(true);
    try {
      if (subscribed) {
        await unsubscribeFromPush();
        setState("default");
      } else {
        const res = await subscribeToPush("viewer", env.vapidPublicKey);
        setState(
          res.ok ? "subscribed" : res.reason === "denied" ? "denied" : "default",
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy || denied}
      aria-label={hint}
      title={hint}
      className={cn(
        "flex items-center justify-center rounded-full transition hover:bg-white/5 hover:text-sand-50 disabled:cursor-default disabled:opacity-60",
        subscribed ? "text-ember-300" : "text-sand-100/80",
        className,
      )}
    >
      <Icon className={iconClassName} />
      <span className="sr-only">{t("push.viewer")}</span>
    </button>
  );
}
