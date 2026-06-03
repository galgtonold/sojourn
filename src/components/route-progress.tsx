"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * A slim ember progress bar that rides along the top of the viewport during
 * client navigations. Starts on an internal link click (or back/forward) and
 * finishes once the new route + query commits.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [value, setValue] = useState(0);
  const [active, setActive] = useState(false);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const done = useRef<ReturnType<typeof setTimeout> | null>(null);

  function stopTimers() {
    if (tick.current) clearInterval(tick.current);
    if (done.current) clearTimeout(done.current);
    tick.current = null;
    done.current = null;
  }

  function start() {
    stopTimers();
    setActive(true);
    setValue(8);
    tick.current = setInterval(() => {
      // Ease toward 90% but never reach it until the route commits.
      setValue((v) => (v >= 90 ? v : v + (90 - v) * 0.14));
    }, 180);
  }

  function complete() {
    stopTimers();
    setValue(100);
    done.current = setTimeout(() => {
      setActive(false);
      setValue(0);
    }, 360);
  }

  // Begin on any same-origin link click or history navigation.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      )
        return;
      const anchor = (e.target as HTMLElement | null)?.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      const target = anchor.getAttribute("target");
      if (!href || target === "_blank" || anchor.hasAttribute("download")) return;
      let url: URL;
      try {
        url = new URL(anchor.href, location.href);
      } catch {
        return;
      }
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search)
        return;
      start();
    }
    function onPop() {
      start();
    }
    document.addEventListener("click", onClick, { capture: true });
    window.addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("click", onClick, { capture: true });
      window.removeEventListener("popstate", onPop);
      stopTimers();
    };
  }, []);

  // Commit: the route (or its query string) changed — finish the bar.
  const key = `${pathname}?${search.toString()}`;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    complete();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5"
      style={{ opacity: active ? 1 : 0, transition: "opacity 250ms ease" }}
    >
      <div
        className="h-full bg-gradient-to-r from-ember-500 via-ember-400 to-ember-300 shadow-[0_0_10px_rgba(255,143,77,0.7)]"
        style={{
          width: `${value}%`,
          transition: "width 200ms ease",
        }}
      />
    </div>
  );
}
