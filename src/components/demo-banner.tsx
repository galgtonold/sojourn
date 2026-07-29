"use client";
import { useEffect, useState } from "react";
import { FlaskConical, Lock } from "lucide-react";
import { env } from "@/lib/env";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n";

// A standing "this is a demo" marker, on every page rather than only the admin:
// someone who lands on a trip page from a link needs to know the journeys are
// invented, and someone who clicks Save in the admin needs to know why nothing
// happened. It carries the only link that matters on a showcase — how to get
// the thing.
//
// A floating pill rather than a full-width bar: the admin nav is already fixed
// at the top, and a bar at the bottom would fight the footer on every page.
// Renders nothing unless NEXT_PUBLIC_DEMO_MODE is set, which is to say: nothing
// on a self-hosted install.
export function DemoBanner() {
  const t = useT();
  const [blocked, setBlocked] = useState(false);

  // When the demo refuses a write, say why — right here, where the reader is
  // already being told this is a demo. The alternative was threading a demo
  // case through the error handling of fifteen separate admin components, none
  // of which currently share a fetch helper; a save that silently does nothing
  // is the one outcome worse than either.
  //
  // Wrapping fetch is intrusive, so it is scoped tightly: only in demo mode
  // (this whole component is inert otherwise), only observing the status, and
  // the original is restored on unmount. A self-hosted install never runs it.
  useEffect(() => {
    if (!env.demoMode) return;
    const original = window.fetch;
    let timer: ReturnType<typeof setTimeout>;
    window.fetch = async (...args) => {
      const res = await original(...args);
      const url = typeof args[0] === "string" ? args[0] : (args[0] as Request)?.url ?? "";
      if (res.status === 403 && url.includes("/api/")) {
        setBlocked(true);
        clearTimeout(timer);
        timer = setTimeout(() => setBlocked(false), 6000);
      }
      return res;
    };
    return () => {
      window.fetch = original;
      clearTimeout(timer);
    };
  }, []);

  if (!env.demoMode) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-3">
      <div
        className={cn(
          "glass pointer-events-auto flex max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-full py-2 pl-3 pr-2 text-xs shadow-lg transition-colors",
          blocked && "ring-1 ring-ember-400/60",
        )}
      >
        {blocked ? (
          <Lock className="size-4 shrink-0 text-ember-400" />
        ) : (
          <FlaskConical className="size-4 shrink-0 text-ember-400" />
        )}
        <span className="font-semibold text-sand-50">
          {t("demo.banner.label")}
        </span>
        <span
          className={cn(
            "truncate",
            blocked ? "text-sand-50" : "hidden text-sand-100/60 sm:inline",
          )}
        >
          {blocked ? t("demo.blocked") : t("demo.banner.text")}
        </span>
        <a
          href="https://github.com/galgtonold/sojourn"
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-full bg-ember-500 px-3 py-1 font-semibold text-ink-950 transition hover:bg-ember-400"
        >
          {t("demo.banner.cta")}
        </a>
      </div>
    </div>
  );
}
