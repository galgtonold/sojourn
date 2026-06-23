import Link from "next/link";
import { T, BrandTagline } from "@/components/i18n";

export function SiteFooter({ name }: { name: string }) {
  return (
    <footer className="border-t border-white/5 bg-ink-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-12 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-display text-xl">{name}</p>
          <p className="mt-1 text-sm text-sand-100/50">
            <BrandTagline />
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
    </footer>
  );
}
