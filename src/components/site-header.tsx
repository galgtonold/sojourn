import Link from "next/link";
import { Compass, Search } from "lucide-react";
import { env } from "@/lib/env";

export function SiteHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div className="glass mx-auto mt-3 flex max-w-6xl items-center justify-between rounded-full px-4 py-2.5 sm:px-6">
        <Link
          href="/"
          className="group flex items-center gap-2 font-display text-lg font-semibold tracking-tight"
        >
          <Compass className="size-5 text-ember-400 transition-transform group-hover:rotate-45" />
          <span>{env.siteName}</span>
        </Link>

        <nav className="flex items-center gap-1 text-sm">
          <Link
            href="/posts"
            className="rounded-full px-3 py-1.5 text-sand-100/80 transition hover:bg-white/5 hover:text-sand-50"
          >
            Stories
          </Link>
          <Link
            href="/trips"
            className="rounded-full px-3 py-1.5 text-sand-100/80 transition hover:bg-white/5 hover:text-sand-50"
          >
            Trips
          </Link>
          <Link
            href="/map"
            className="rounded-full px-3 py-1.5 text-sand-100/80 transition hover:bg-white/5 hover:text-sand-50"
          >
            Map
          </Link>
          <Link
            href="/search"
            aria-label="Search"
            className="flex size-9 items-center justify-center rounded-full text-sand-100/80 transition hover:bg-white/5 hover:text-sand-50"
          >
            <Search className="size-4" />
          </Link>
        </nav>
      </div>
    </header>
  );
}
