import Link from "next/link";
import { env } from "@/lib/env";
import { DEMO_MODE } from "@/lib/content";
import { T } from "@/components/i18n";

export function SiteFooter() {
  return (
    <footer className="border-t border-white/5 bg-ink-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-12 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-display text-xl">{env.siteName}</p>
          <p className="mt-1 text-sm text-sand-100/50">
            <T k="footer.tagline" />
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-sand-100/70">
          <Link href="/trips" className="hover:text-ember-400">
            <T k="nav.trips" />
          </Link>
          <Link href="/map" className="hover:text-ember-400">
            <T k="nav.map" />
          </Link>
          <Link href="/search" className="hover:text-ember-400">
            <T k="nav.search" />
          </Link>
          <Link href="/admin" className="hover:text-ember-400">
            <T k="nav.admin" />
          </Link>
        </nav>
      </div>
      {DEMO_MODE && (
        <div className="border-t border-white/5 bg-ember-600/10 px-6 py-2 text-center text-xs text-ember-300">
          <T k="footer.demo" />
        </div>
      )}
    </footer>
  );
}
