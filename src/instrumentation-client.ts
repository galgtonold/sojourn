// Browser error reporting — off unless the operator sets NEXT_PUBLIC_SENTRY_DSN.
//
// Next runs this file on every page load, so a static `import * as Sentry` here
// would put the SDK in every visitor's bundle whether or not it is ever used.
// The DSN is inlined at build time, so when it is blank the whole branch below
// is dead code: the import is never evaluated and the chunk is never fetched.
// An install that hasn't configured this downloads nothing extra at all.
//
// Deliberately distinct from the server's SENTRY_DSN (sentry.server.config.ts).
// Sending your own server's stack traces to a third party is one decision;
// sending your readers' browser errors is a bigger one, and it should be made
// on purpose rather than inherited.

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

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
