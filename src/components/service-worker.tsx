"use client";
import { useEffect } from "react";

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
    // initial render / hydration.
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
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
