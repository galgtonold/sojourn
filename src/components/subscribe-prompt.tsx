"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, X } from "lucide-react";
import { env } from "@/lib/env";
import { getPushState, subscribeToPush } from "@/lib/push-client";
import { useT } from "@/components/i18n";

const DISMISS_KEY = "sojourn:subprompt-dismissed";

/**
 * Shown once a reader reaches the end of an article: invites them to get a
 * push notification when a new story is published. Renders a sentinel where
 * it's placed (end of the post) and a fixed toast that slides up when the
 * sentinel scrolls into view — but only if push is available and the reader
 * hasn't already subscribed, blocked, or dismissed it.
 */
export function SubscribePrompt() {
  const sentinel = useRef<HTMLDivElement>(null);
  const [eligible, setEligible] = useState(false);
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState<"idle" | "working" | "done" | "denied">(
    "idle",
  );
  const t = useT();

  // Decide eligibility once on mount.
  useEffect(() => {
    if (!env.vapidPublicKey) return;
    if (localStorage.getItem(DISMISS_KEY)) return;
    getPushState().then((s) => {
      if (s === "default") setEligible(true);
    });
  }, []);

  // Reveal when the reader reaches the end.
  useEffect(() => {
    if (!eligible || !sentinel.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    obs.observe(sentinel.current);
    return () => obs.disconnect();
  }, [eligible]);

  function dismiss() {
    setVisible(false);
    localStorage.setItem(DISMISS_KEY, "1");
  }

  async function subscribe() {
    setStatus("working");
    const res = await subscribeToPush("viewer", env.vapidPublicKey);
    if (res.ok) {
      setStatus("done");
      setTimeout(() => setVisible(false), 1800);
    } else {
      setStatus(res.reason === "denied" ? "denied" : "idle");
      // Leave the denied guidance on screen so the reader can act on it
      // (re-enable in browser settings) — they can close it with the ✕.
    }
  }

  return (
    <>
      <div ref={sentinel} aria-hidden className="h-px w-full" />
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.35, ease: [0.2, 0.7, 0.2, 1] }}
            className="fixed inset-x-3 bottom-3 z-[90] mx-auto max-w-md sm:inset-x-auto sm:right-5"
          >
            <div className="glass flex items-start gap-3 rounded-2xl p-4 shadow-2xl">
              <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-ember-500/15 text-ember-400">
                <Bell className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                {status === "done" ? (
                  <p className="text-sm font-medium text-lagoon-400">
                    {t("subscribe.done")}
                  </p>
                ) : status === "denied" ? (
                  <p className="text-sm text-sand-100/70">
                    {t("subscribe.denied")}
                  </p>
                ) : (
                  <>
                    <p className="text-sm font-medium text-sand-50">
                      {t("subscribe.title")}
                    </p>
                    <p className="mt-0.5 text-sm text-sand-100/60">
                      {t("subscribe.body")}
                    </p>
                    <button
                      onClick={subscribe}
                      disabled={status === "working"}
                      className="mt-3 inline-flex items-center gap-2 rounded-full bg-ember-500 px-3.5 py-1.5 text-sm font-semibold text-ink-950 transition hover:bg-ember-400 disabled:opacity-60"
                    >
                      <Bell className="size-3.5" />
                      {status === "working"
                        ? t("subscribe.working")
                        : t("subscribe.cta")}
                    </button>
                  </>
                )}
              </div>
              <button
                onClick={dismiss}
                aria-label={t("common.dismiss")}
                className="grid size-7 shrink-0 place-items-center rounded-full text-sand-100/50 transition hover:bg-white/10 hover:text-sand-50"
              >
                <X className="size-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
