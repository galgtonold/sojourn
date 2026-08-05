"use client";
import { useEffect } from "react";
import { ensureSubscriptionLive } from "@/lib/push-client";

/**
 * Registers the service worker on load for every visitor, enabling offline
 * caching and install-to-home-screen (PWA). Push subscription is handled
 * separately by push-client.ts; this just makes sure the worker is active so
 * already-visited pages and assets keep working without a connection.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    // Defer until the page is idle so registration never competes with the
    // initial render / hydration. The ?v=<build> makes the script URL change
    // each deploy, so the browser installs the new worker — which names its
    // cache per-build and purges the previous one (no stale-asset accumulation).
    const version = process.env.NEXT_PUBLIC_SW_VERSION || "dev";
    const register = () => {
      navigator.serviceWorker
        .register(`/sw.js?v=${version}`)
        .then(() => {
          // With a worker in place, make sure the server still holds this
          // browser's push subscription. Done here rather than in the bell or
          // the toggle because a browser has exactly one subscription, so this
          // is a per-browser question and not a per-control one — and this
          // component already runs once on every page. It self-throttles to
          // about once a day, and no-ops entirely unless this browser is
          // actually subscribed. See ensureSubscriptionLive.
          void ensureSubscriptionLive();
        })
        .catch(() => {
          // best effort — offline support is a progressive enhancement
        });
    };
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
