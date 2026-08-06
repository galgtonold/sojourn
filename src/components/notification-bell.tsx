"use client";
import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Loader2 } from "lucide-react";
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
  const [showHelp, setShowHelp] = useState(false);
  // Subscribing from the bell said nothing. For a first-time reader the browser
  // puts up its own permission prompt, so the click is not silent — but once
  // permission is already granted, one click subscribes with no acknowledgement
  // beyond a small icon swap. SubscribePrompt has told people what they signed
  // up for since it was written; this is the bell borrowing that sentence.
  const [justSubscribed, setJustSubscribed] = useState(false);
  // Start in the neutral "off" state and render immediately (no pop-in on load,
  // unlike waiting for the async getPushState). Refine once we know the real
  // state; only then can we discover an unsupported browser and hide.
  const [state, setState] = useState<PushState>("default");
  const [resolved, setResolved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!justSubscribed) return;
    const t = setTimeout(() => setJustSubscribed(false), 6000);
    return () => clearTimeout(t);
  }, [justSubscribed]);

  useEffect(() => {
    if (!pushAvailable) return;
    getPushState().then((s) => {
      setState(s);
      setResolved(true);
    });
  }, []);

  if (!pushAvailable || (resolved && state === "unsupported")) return null;

  const subscribed = state === "subscribed";
  const denied = state === "denied";
  // While a click is in flight, swap in a spinner so the press reads as
  // acknowledged instantly — the subscribe/unsubscribe round-trip takes a beat
  // and an unchanging bell left the reader unsure the tap registered.
  const Icon = busy ? Loader2 : subscribed ? BellRing : denied ? BellOff : Bell;
  const status = denied
    ? t("push.blocked")
    : subscribed
      ? t("push.on")
      : t("push.enable");
  const hint = denied ? t("push.blockedHelp") : `${t("push.viewer")} — ${status}`;

  async function handleClick() {
    if (busy) return;
    // The browser has blocked notifications at the site level — we can't reprompt
    // (that's the whole point of a block), so show how to undo it in a small
    // popover anchored to the bell (not a page-dimming modal) instead of silently
    // doing nothing. The subscribe prompt itself never appears here.
    if (denied) {
      setShowHelp((s) => !s);
      return;
    }
    setBusy(true);
    try {
      if (subscribed) {
        await unsubscribeFromPush();
        setState("default");
        setJustSubscribed(false);
      } else {
        const res = await subscribeToPush("viewer", env.vapidPublicKey);
        setState(
          res.ok ? "subscribed" : res.reason === "denied" ? "denied" : "default",
        );
        if (res.ok) setJustSubscribed(true);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        aria-label={hint}
        title={hint}
        className={cn(
          "flex items-center justify-center rounded-full transition hover:bg-white/5 hover:text-sand-50 disabled:cursor-default disabled:opacity-60",
          subscribed
            ? "text-ember-300"
            : denied
              ? "text-sand-100/60"
              : "text-sand-100/80",
          className,
        )}
      >
        <Icon className={cn(iconClassName, busy && "animate-spin")} />
        <span className="sr-only">{t("push.viewer")}</span>
      </button>
      {justSubscribed && (
        <div
          // `status` rather than `alert`: worth announcing, not worth
          // interrupting. Dismissed on click like the help popover, and on a
          // timer so it does not sit there for the rest of the visit.
          role="status"
          onClick={() => setJustSubscribed(false)}
          className="absolute right-0 top-full z-50 mt-2 w-64 cursor-default rounded-xl border border-white/10 bg-ink-900 p-3 text-xs leading-relaxed text-sand-100/80 shadow-2xl"
        >
          {t("subscribe.done")}
        </div>
      )}
      {showHelp && (
        <>
          {/* Transparent click-away catcher — closes the popover without dimming
              the page (unlike a modal). */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setShowHelp(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            role="status"
            className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-white/10 bg-ink-900 p-3 text-xs leading-relaxed text-sand-100/80 shadow-2xl"
          >
            {t("push.blockedHelp")}
          </div>
        </>
      )}
    </div>
  );
}
