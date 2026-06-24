import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

Sentry.init({
  dsn,
  // Inert until a DSN is set, and only reports from production — so this is safe
  // to ship before the Sentry project exists, and stays quiet in local dev.
  enabled: Boolean(dsn) && process.env.NODE_ENV === "production",
  // Errors only for now (no performance spans) to stay comfortably inside the
  // free tier. Raise to ~0.1 later if you want tracing.
  tracesSampleRate: 0,
  // Don't send IPs / cookies / request bodies — this site has EU readers.
  sendDefaultPii: false,
});
