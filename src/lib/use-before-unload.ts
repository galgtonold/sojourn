"use client";
import { useEffect } from "react";

/**
 * Warn before leaving the page (tab close, refresh, back to an external page)
 * while `when` is true — e.g. an editor has unsaved changes. The browser shows
 * its native "Leave site?" prompt. (App Router fires no events for in-app client
 * navigation, so this covers the common data-loss vectors, not link clicks.)
 */
export function useBeforeUnload(when: boolean): void {
  useEffect(() => {
    if (!when) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [when]);
}
