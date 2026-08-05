"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useT } from "@/components/i18n";

// Hides the global header/footer on full-screen immersive routes (the journey
// map), where the page provides its own navigation.
const IMMERSIVE = /^\/trips\/[^/]+\/map\/?$/;

export function SiteChrome({
  header,
  footer,
  children,
}: {
  header: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const immersive = IMMERSIVE.test(pathname);
  const t = useT();

  return (
    <>
      {/*
        First thing in the tab order, invisible until focused. Without it a
        keyboard user tabs the whole primary nav on every page — and on a post,
        the gallery and the map before reaching a word of the article.
        Not rendered on immersive routes, which have no header to skip.
      */}
      {!immersive && (
        <a
          href="#main"
          className="sr-only rounded-full bg-ember-400 px-5 py-2.5 text-sm font-semibold text-ink-950 focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200]"
        >
          {t("nav.skipToContent")}
        </a>
      )}
      {!immersive && header}
      {/* tabIndex -1 so the anchor can move focus here, not just scroll. */}
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      {!immersive && footer}
    </>
  );
}
