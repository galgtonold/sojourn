import Link from "next/link";
import { Compass } from "lucide-react";
import { T } from "@/components/i18n";

/**
 * The "this doesn't exist" screen, in one place so every not-found boundary
 * shows the same thing.
 *
 * There is more than one boundary on purpose. Next resolves `notFound()` to the
 * NEAREST not-found file, and a root-level one was not being picked up for
 * `notFound()` thrown inside /posts/[slug] and /trips/[slug] — those routes are
 * prerendered with `revalidate = false`, and an unknown slug was served as a
 * bare shell: header, footer, and an empty <main> between them. Confirmed in a
 * browser, after hydration, not just in the HTML. So a stale link to a deleted
 * or mistyped entry — the single most likely way to hit a 404 on a site like
 * this — showed the visitor nothing at all.
 */
export function NotFoundView() {
  return (
    <div className="grid min-h-[60vh] place-items-center px-6 py-24 text-center">
      <div>
        <Compass className="mx-auto size-10 text-ember-400" />
        <h1 className="mt-6 font-display text-5xl font-semibold">
          <T k="notFound.title" />
        </h1>
        <p className="mt-3 text-sand-100/70">
          <T k="notFound.body" />
        </p>
        <Link
          href="/"
          className="mt-8 inline-block rounded-full bg-ember-500 px-5 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-ember-400"
        >
          <T k="notFound.back" />
        </Link>
      </div>
    </div>
  );
}
