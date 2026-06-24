import * as Sentry from "@sentry/nextjs";

// Next.js loads this once per server/edge runtime at startup. It pulls in the
// matching Sentry init so server and edge errors are captured.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Reports errors thrown in Server Components, route handlers and middleware.
export const onRequestError = Sentry.captureRequestError;
