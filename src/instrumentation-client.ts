import { injectedPublicConfig } from "@/lib/public-config";

// Browser error reporting — off unless the operator configures a client DSN.
//
// Next runs this file on every page load, so a static `import * as Sentry` here
// would put the SDK in every visitor's bundle whether or not it is ever used.
// The import below is dynamic and only reached when a DSN is present, so an
// install that has not configured this never fetches the chunk.
//
// ── Read the same DSN everything else reads ─────────────────────────────────
//
// This used to read `process.env.NEXT_PUBLIC_SENTRY_DSN` alone, which Next
// inlines at BUILD time. That is right on Vercel, where the build and the
// deployment are the same act — and wrong for the published image, which is
// built by CI with no DSN at all. An operator setting SENTRY_DSN_CLIENT at
// runtime got the worst possible outcome: `error.tsx` and the admin's privacy
// page both resolve the DSN through @/lib/public-config, so the admin reported
// browser error reporting as ON and the boundary dutifully called
// `captureException` — into an SDK that had never been initialised, because
// only this file decides that, and this file could not see the value.
// captureException on an uninitialised SDK does nothing and says nothing.
//
// So resolve it the way every other consumer does: the runtime config the
// server injected, falling back to whatever was inlined at build.
//
// Deliberately distinct from the server's SENTRY_DSN (sentry.server.config.ts).
// Sending your own server's stack traces to a third party is one decision;
// sending your readers' browser errors is a bigger one, and it should be made
// on purpose rather than inherited.

const dsn =
  injectedPublicConfig()?.sentryDsnClient || process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  void import("@sentry/nextjs").then((Sentry) => {
    Sentry.init({
      dsn,
      // Match the server config: report from production only, so a developer's
      // console noise never reaches someone else's dashboard.
      enabled: process.env.NODE_ENV === "production",
      // Errors only. Performance tracing samples every navigation and is a
      // separate, much larger, opt-in than "tell me when a page breaks".
      tracesSampleRate: 0,
    });
  });
}

// Required by Next for client-side navigation instrumentation. Resolves to a
// no-op when Sentry was never initialised.
export async function onRouterTransitionStart(
  ...args: Parameters<
    typeof import("@sentry/nextjs")["captureRouterTransitionStart"]
  >
) {
  if (!dsn) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRouterTransitionStart(...args);
}
