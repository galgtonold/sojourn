"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Compass, ExternalLink, KeyRound, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { T, LanguageSwitcher, useT } from "@/components/i18n";
import type { DictKey } from "@/lib/i18n";

type Item = { href: string; label: DictKey; exact?: boolean; owner?: boolean };

const ITEMS: Item[] = [
  { href: "/admin", label: "admin.dashboard", exact: true },
  { href: "/admin/posts", label: "admin.nav.stories" },
  { href: "/admin/comments", label: "admin.nav.comments" },
  { href: "/admin/members", label: "admin.members.link", owner: true },
  { href: "/admin/ai-usage", label: "admin.usage.link", owner: true },
  { href: "/admin/settings", label: "admin.settings.link", owner: true },
];

/**
 * Persistent admin chrome — a glass bar that replaces the reader header on
 * authenticated admin pages, so editors move between sections without bouncing
 * off the dashboard. Owner-only sections are hidden for collaborators. Renders
 * nothing on the auth flows and the full-screen post preview.
 */
export function AdminNav({ isOwner }: { isOwner: boolean }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const t = useT();

  if (
    pathname === "/admin/login" ||
    pathname === "/admin/welcome" ||
    pathname.includes("/preview")
  )
    return null;

  const items = ITEMS.filter((i) => isOwner || !i.owner);
  const isActive = (i: Item) =>
    i.exact ? pathname === i.href : pathname.startsWith(i.href);

  async function signOut() {
    await getBrowserSupabase()?.auth.signOut();
    router.push("/admin/login");
    router.refresh();
  }

  const iconBtn =
    "grid size-9 place-items-center rounded-full text-sand-100/70 transition hover:bg-white/5 hover:text-sand-50";

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 sm:px-4">
      <div className="glass mx-auto mt-3 flex max-w-6xl items-center gap-2 rounded-3xl px-3 py-2 sm:rounded-full sm:px-4">
        <Link
          href="/admin"
          className="flex shrink-0 items-center gap-2 pr-1 font-display text-base font-semibold tracking-tight"
        >
          <Compass className="size-5 text-ember-400" />
          <span className="hidden sm:inline">Admin</span>
        </Link>

        <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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

        <div className="flex shrink-0 items-center gap-0.5">
          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm text-sand-100/70 transition hover:bg-white/5 hover:text-sand-50"
          >
            <ExternalLink className="size-4" />
            <span className="hidden lg:inline">
              <T k="admin.nav.viewSite" />
            </span>
          </Link>
          <span className="hidden border-l border-white/10 pl-1 sm:block">
            <LanguageSwitcher />
          </span>
          <Link
            href="/admin/account"
            aria-label={t("admin.password")}
            className={iconBtn}
          >
            <KeyRound className="size-4" />
          </Link>
          <button
            type="button"
            onClick={signOut}
            aria-label={t("admin.signOut")}
            className={iconBtn}
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
