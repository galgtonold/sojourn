"use client";
import { useEffect } from "react";
import Link from "next/link";
import { CloudOff, RotateCw } from "lucide-react";
import { T } from "@/components/i18n";
import { env } from "@/lib/env";

/**
 * What a visitor sees when a page throws.
 *
 * Before this there was nothing: thirteen loading states and not one error
 * boundary, so any failure fell through to Next's stock screen — a bare
 * "Application error: a client-side exception has occurred", which says nothing
 * to a reader, offers no way out, and looks like the site is broken rather than
 * one page. (It is exactly what this site showed when a misconfigured image
 * host threw during render.)
 *
 * `reset()` re-renders the segment, which is genuinely worth offering: the
 * common causes here are transient — the database briefly unreachable, a failed
 * fetch — and retrying often just works. The site chrome stays, so the reader
 * can navigate away instead of reaching for the back button.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Without this the boundary would swallow the error: catching it stops it
    // reaching the global handler, so nothing would ever be reported.
    //
    // Imported lazily and only when a DSN is configured. A static import put
    // ~11 KB of Sentry into every page's first load — for a call that did
    // nothing, since the browser SDK is only initialised when the operator has
    // opted in (instrumentation-client.ts).
    if (!env.sentryDsnClient) return;
    void import("@sentry/nextjs").then((S) => S.captureException(error));
  }, [error]);

  return (
    <div className="grid min-h-[60vh] place-items-center px-6 py-24 text-center">
      <div>
        <CloudOff className="mx-auto size-10 text-ember-400" />
        <h1 className="mt-6 font-display text-4xl font-semibold sm:text-5xl">
          <T k="error.title" />
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sand-100/70">
          <T k="error.body" />
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-full bg-ember-500 px-5 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-ember-400"
          >
            <RotateCw className="size-4" />
            <T k="error.retry" />
          </button>
          <Link
            href="/"
            className="rounded-full px-5 py-2.5 text-sm font-semibold text-sand-100/80 ring-1 ring-white/15 transition hover:bg-white/5 hover:text-sand-50"
          >
            <T k="notFound.back" />
          </Link>
        </div>
        {/* The digest is the only handle on a specific failure in the logs, so
            it is shown rather than hidden — quietly, for whoever asks. */}
        {error.digest && (
          <p className="mt-6 font-mono text-xs text-sand-100/50">{error.digest}</p>
        )}
      </div>
    </div>
  );
}
