import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { T } from "@/components/i18n";
import type { DictKey } from "@/lib/i18n";

// What the site looks like before it has anything to show.
//
// Every surface used to answer this with one dimmed sentence — and /posts,
// /trips and /search did not answer it at all, so a fresh install rendered a
// heading, a subtitle, and then nothing, with the footer floating halfway up a
// black page. It reads as broken rather than new, which is a poor first
// impression for the one screen every self-hoster sees first.
//
// The mark is a route that runs out. Dotted like the way-of-travel line on a
// paper map, ending at a waypoint that is drawn but not filled in — somewhere
// noted and not yet reached. It is the same device on every surface, small and
// low-contrast, so the pages stay quiet and the type does the talking.

/**
 * A dotted trail ending at an unreached waypoint.
 *
 * Deliberately not animated. The device is the whole flourish; drawing it in
 * would make an empty page the busiest thing on the site.
 */
function TrailMark() {
  return (
    <svg
      viewBox="0 0 168 56"
      className="mx-auto h-14 w-auto text-sand-100"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M6 42C26 42 30 18 52 18s32 28 54 24 26-22 44-20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="0.5 9"
        opacity="0.35"
      />
      <circle
        cx="152"
        cy="22"
        r="6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-ember-400"
      />
    </svg>
  );
}

export function EmptyState({
  titleKey,
  titleVars,
  bodyKey,
  action,
}: {
  titleKey: DictKey;
  /** For a title that names something — search says which query found nothing. */
  titleVars?: Record<string, string | number>;
  bodyKey: DictKey;
  /** Only when there is somewhere genuinely worth going. */
  action?: { href: string; labelKey: DictKey };
}) {
  return (
    // Centred in the space that is left, so the footer stops floating in the
    // middle of an otherwise black page.
    <div className="grid min-h-[44vh] place-items-center px-6 py-16 text-center">
      <div className="max-w-sm">
        <TrailMark />
        <h2 className="mt-7 font-display text-2xl font-semibold sm:text-3xl">
          <T k={titleKey} vars={titleVars} />
        </h2>
        <p className="mt-3 text-sand-100/55">
          <T k={bodyKey} />
        </p>
        {action && (
          <Link
            href={action.href}
            className="mt-7 inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold transition hover:border-ember-400 hover:text-ember-400"
          >
            <T k={action.labelKey} />
            <ArrowRight className="size-4" />
          </Link>
        )}
      </div>
    </div>
  );
}
