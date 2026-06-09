"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Menu, Search, X } from "lucide-react";
import { env } from "@/lib/env";
import { cn } from "@/lib/utils";
import { T, LanguageSwitcher, useT } from "@/components/i18n";

const LINKS = [
  { href: "/posts", label: "nav.stories" as const },
  { href: "/trips", label: "nav.trips" as const },
  { href: "/map", label: "nav.map" as const },
  { href: "/photos", label: "nav.photos" as const },
];

export function SiteHeader() {
  const t = useT();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // The draft-preview banner is a fixed h-9 strip at the very top; drop the
  // header below it on the preview route so they don't overlap.
  const isPreview = /^\/admin\/posts\/[^/]+\/preview\/?$/.test(pathname ?? "");

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header className={cn("fixed inset-x-0 z-50", isPreview ? "top-9" : "top-0")}>
      <div className="glass mx-auto mt-3 max-w-6xl rounded-3xl px-4 py-2.5 sm:rounded-full sm:px-6">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="group flex items-center gap-2 font-display text-lg font-semibold tracking-tight"
          >
            <Compass className="size-5 text-ember-400 transition-transform group-hover:rotate-45" />
            <span>{env.siteName}</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 text-sm sm:flex">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-full px-3 py-1.5 text-sand-100/80 transition hover:bg-white/5 hover:text-sand-50"
              >
                <T k={l.label} />
              </Link>
            ))}
            <Link
              href="/search"
              className="flex size-9 items-center justify-center rounded-full text-sand-100/80 transition hover:bg-white/5 hover:text-sand-50"
            >
              <Search className="size-4" />
              <span className="sr-only">
                <T k="search.title" />
              </span>
            </Link>
            <span className="ml-1 border-l border-white/10 pl-1">
              <LanguageSwitcher />
            </span>
          </nav>

          {/* Mobile controls */}
          <div className="flex items-center gap-1 sm:hidden">
            <Link
              href="/search"
              className="flex size-10 items-center justify-center rounded-full text-sand-100/80 transition hover:bg-white/5 active:bg-white/10"
            >
              <Search className="size-5" />
              <span className="sr-only">
                <T k="search.title" />
              </span>
            </Link>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-label={t(open ? "common.close" : "nav.menu")}
              className="flex size-10 items-center justify-center rounded-full text-sand-100/80 transition hover:bg-white/5 active:bg-white/10"
            >
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>

        {/* Mobile dropdown panel */}
        <div
          className={cn(
            "grid overflow-hidden transition-all duration-300 sm:hidden",
            open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
          )}
        >
          <nav className="min-h-0">
            <div className="mt-2 flex flex-col gap-1 border-t border-white/10 pt-2 text-base">
              {LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="rounded-xl px-3 py-2.5 text-sand-100/80 transition hover:bg-white/5 active:bg-white/10"
                >
                  <T k={l.label} />
                </Link>
              ))}
              <div className="mt-1 flex items-center justify-between border-t border-white/10 px-3 pt-3">
                <span className="text-xs uppercase tracking-wider text-sand-100/40">
                  <T k="nav.menu" />
                </span>
                <LanguageSwitcher />
              </div>
            </div>
          </nav>
        </div>
      </div>
    </header>
  );
}
