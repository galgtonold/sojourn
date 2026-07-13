"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Compass, ExternalLink, KeyRound, LogOut, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { T, LanguageSwitcher, useT } from "@/components/i18n";
import type { DictKey } from "@/lib/i18n";

type Item = { href: string; label: DictKey; exact?: boolean; owner?: boolean };

const ITEMS: Item[] = [
  { href: "/admin", label: "admin.dashboard", exact: true },
  { href: "/admin/posts", label: "admin.nav.stories" },
  { href: "/admin/comments", label: "admin.nav.comments" },
  { href: "/admin/interactions", label: "admin.nav.interactions" },
  { href: "/admin/members", label: "admin.members.link", owner: true },
  { href: "/admin/ai-usage", label: "admin.usage.link", owner: true },
  { href: "/admin/settings", label: "admin.settings.link", owner: true },
];

/**
 * Persistent admin chrome — a glass bar that replaces the reader header on
 * authenticated admin pages, so editors move between sections without bouncing
 * off the dashboard. Owner-only sections are hidden for collaborators. On a
 * phone the sections collapse into a tap-to-open menu (no cramped side-scroll).
 * Renders nothing on the auth flows and the full-screen post preview.
 */
export function AdminNav({ isOwner }: { isOwner: boolean }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const t = useT();
  const [open, setOpen] = useState(false);

  // Close the mobile menu on every route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const hidden =
    pathname === "/admin/login" ||
    pathname === "/admin/welcome" ||
    pathname.includes("/preview");

  const items = ITEMS.filter((i) => isOwner || !i.owner);
  const isActive = (i: Item) =>
    i.exact ? pathname === i.href : pathname.startsWith(i.href);

  async function signOut() {
    await getBrowserSupabase()?.auth.signOut();
    router.push("/admin/login");
    router.refresh();
  }

  if (hidden) return null;

  const iconBtn =
    "grid size-9 place-items-center rounded-full text-sand-100/70 transition hover:bg-white/5 hover:text-sand-50";

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 sm:px-4">
      <div className="glass mx-auto mt-3 max-w-6xl rounded-3xl px-3 py-2 sm:rounded-full sm:px-4">
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/admin"
            className="flex shrink-0 items-center gap-2 pr-1 font-display text-base font-semibold tracking-tight"
          >
            <Compass className="size-5 text-ember-400" />
            <span>Admin</span>
          </Link>

          {/* Desktop: section pills + account cluster */}
          <nav className="hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto text-sm sm:flex [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {items.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                aria-current={isActive(i) ? "page" : undefined}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 transition",
                  isActive(i)
                    ? "bg-white/10 text-sand-50"
                    : "text-sand-100/70 hover:bg-white/5 hover:text-sand-50",
                )}
              >
                <T k={i.label} />
              </Link>
            ))}
          </nav>
          <div className="hidden shrink-0 items-center gap-0.5 sm:flex">
            <Link
              href="/"
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm text-sand-100/70 transition hover:bg-white/5 hover:text-sand-50"
            >
              <ExternalLink className="size-4" />
              <span className="hidden lg:inline">
                <T k="admin.nav.viewSite" />
              </span>
            </Link>
            <span className="border-l border-white/10 pl-1">
              <LanguageSwitcher />
            </span>
            <Link href="/admin/account" aria-label={t("admin.password")} className={iconBtn}>
              <KeyRound className="size-4" />
            </Link>
            <button type="button" onClick={signOut} aria-label={t("admin.signOut")} className={iconBtn}>
              <LogOut className="size-4" />
            </button>
          </div>

          {/* Mobile: a single menu toggle */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={t("nav.menu")}
            className="flex size-10 items-center justify-center rounded-full text-sand-100/80 transition hover:bg-white/5 active:bg-white/10 sm:hidden"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>

        {/* Mobile dropdown panel */}
        <div
          className={cn(
            "grid overflow-hidden transition-all duration-300 sm:hidden",
            open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="min-h-0">
            <div className="mt-2 flex flex-col gap-1 border-t border-white/10 pt-2 text-base">
              {items.map((i) => (
                <Link
                  key={i.href}
                  href={i.href}
                  aria-current={isActive(i) ? "page" : undefined}
                  className={cn(
                    "rounded-xl px-3 py-2.5 transition",
                    isActive(i)
                      ? "bg-white/10 text-sand-50"
                      : "text-sand-100/80 hover:bg-white/5 active:bg-white/10",
                  )}
                >
                  <T k={i.label} />
                </Link>
              ))}
              <div className="mt-1 flex items-center justify-between gap-2 border-t border-white/10 px-3 pt-3">
                <Link
                  href="/"
                  className="inline-flex items-center gap-1.5 text-sm text-sand-100/70 hover:text-sand-50"
                >
                  <ExternalLink className="size-4" /> <T k="admin.nav.viewSite" />
                </Link>
                <LanguageSwitcher />
              </div>
              <div className="flex items-center justify-between gap-2 px-3 pb-1 pt-1">
                <Link
                  href="/admin/account"
                  className="inline-flex items-center gap-1.5 text-sm text-sand-100/70 hover:text-sand-50"
                >
                  <KeyRound className="size-4" /> <T k="admin.password" />
                </Link>
                <button
                  type="button"
                  onClick={signOut}
                  className="inline-flex items-center gap-1.5 text-sm text-sand-100/70 hover:text-sand-50"
                >
                  <LogOut className="size-4" /> <T k="admin.signOut" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
