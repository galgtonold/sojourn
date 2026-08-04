import * as Sentry from "@sentry/nextjs";

// Next.js loads this once per server/edge runtime at startup. It pulls in the
// matching Sentry init so server and edge errors are captured.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
    // Once per server start, into the place a self-hoster looks when something
    // is wrong: `docker logs`. Not per request — a warning repeated on every
    // request is one nobody reads.
    const { publicConfigFromEnv } = await import("./lib/public-config");
    const { isInsecurePublicUrl, insecurePublicUrlWarning } = await import(
      "./lib/insecure-url"
    );
    const url = publicConfigFromEnv(process.env).supabaseUrl;
    if (isInsecurePublicUrl(url)) console.warn(insecurePublicUrlWarning(url));
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Reports errors thrown in Server Components, route handlers and middleware.
export const onRequestError = Sentry.captureRequestError;
