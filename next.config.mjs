import { withSentryConfig } from "@sentry/nextjs";

// A value that changes on every deploy, exposed to the client so the service
// worker can name its cache per-build and purge the previous one on activate.
// A static cache name (the old "v1") never updates, so stale assets accumulate
// forever and get served on cached loads — see sw.js / service-worker.tsx.
const swVersion =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || String(Date.now());

/** The configured Supabase origin as a next/image remote pattern, or nothing. */
function supabaseImagePattern() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return [];
  try {
    const { protocol, hostname, port } = new URL(raw);
    return [
      {
        protocol: protocol.replace(":", ""),
        hostname,
        ...(port ? { port } : {}),
      },
    ];
  } catch {
    // A malformed URL is the Supabase client's problem to report, loudly and
    // with a better message than a config-time crash here.
    return [];
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit a self-contained server bundle so the same image runs on Vercel,
  // any container host, or a bare VPS (`node .next/standalone/server.js`).
  output: "standalone",
  // Pin the file-tracing root to this project so a stray lockfile in a parent
  // directory can't make Next infer the wrong workspace root (the dev warning).
  outputFileTracingRoot: import.meta.dirname,
  reactStrictMode: true,
  env: { NEXT_PUBLIC_SW_VERSION: swVersion },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "images.unsplash.com" },
      // …and wherever this deploy's Supabase actually lives. The wildcard above
      // only covers Supabase-hosted projects: run the stack locally
      // (127.0.0.1:54321) or self-host it on your own domain and every photo
      // throws "hostname is not configured", which surfaces as a blank page
      // rather than a missing image.
      ...supabaseImagePattern(),
    ],
  },
  eslint: {
    // Lint is run explicitly in CI; don't fail production builds on it.
    ignoreDuringBuilds: true,
  },
  // Security headers (S4). Applied to every response. `frame-ancestors` /
  // X-Frame-Options stop the admin (and the whole site) being framed for
  // clickjacking; nosniff, a strict referrer policy and HSTS are baseline
  // hardening. A full Content-Security-Policy is deliberately NOT set here yet
  // — it needs the script/style/connect/img sources scoped (self, Supabase,
  // openfreemap tiles, unsplash) to avoid breaking the map and image pipeline;
  // `frame-ancestors` alone is safe because it governs only embedding.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

// Wrap with Sentry. With no DSN / org / auth token set, this is a no-op at
// runtime and skips source-map upload at build — so it's safe before the Sentry
// project exists. Once you add SENTRY_DSN (and optionally
// SENTRY_ORG / SENTRY_PROJECT / SENTRY_AUTH_TOKEN for readable stack traces),
// errors start flowing with no further code change.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Quiet during local builds; verbose only in CI.
  silent: !process.env.CI,
  // Don't phone home build telemetry to Sentry.
  telemetry: false,
});
