import * as Sentry from "@sentry/nextjs";

// Edge runtime (middleware). Same posture as the Node server config.
const dsn = process.env.SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn) && process.env.NODE_ENV === "production",
  tracesSampleRate: 0,
  sendDefaultPii: false,
});
