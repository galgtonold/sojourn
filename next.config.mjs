import { withSentryConfig } from "@sentry/nextjs";

// A value that changes on every deploy, exposed to the client so the service
// worker can name its cache per-build and purge the previous one on activate.
// A static cache name (the old "v1") never updates, so stale assets accumulate
// forever and get served on cached loads — see sw.js / service-worker.tsx.
const swVersion =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || String(Date.now());

/**
 * Whether this build knows which Supabase it will talk to.
 *
 * The Docker build deliberately does not: it compiles against a placeholder so
 * one image can serve any deployment (see src/lib/public-config.ts). `.invalid`
 * is reserved by RFC 2606 and can never resolve, which is what makes it a safe
 * stand-in and a reliable signal here.
 */
function buildKnowsItsSupabase() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.hostname.endsWith(".invalid") ? null : url;
  } catch {
    // A malformed URL is the Supabase client's problem to report, loudly and
    // with a better message than a config-time crash here.
    return null;
  }
}

/**
 * Which remote hosts next/image may fetch and re-serve.
 *
 * This list is BAKED IN at build time — it lands in required-server-files.json,
 * so no amount of runtime configuration reaches it. That is the whole
 * difficulty: the published image cannot know where a stranger's Supabase
 * lives, and the wildcard that used to paper over it (`*.supabase.co`) made
 * every deployment an open image proxy for every Supabase project in
 * existence, at its own bandwidth and CPU.
 *
 * So the two cases are handled separately rather than by one loose rule.
 */
function imageConfig() {
  const supabase = buildKnowsItsSupabase();
  if (!supabase) {
    // The portable image. `unoptimized` passes photo URLs through untouched, so
    // they load from whatever Supabase the operator configured at runtime —
    // the only arrangement that works when the host is unknowable at build
    // time. Before this, the published image baked `build.invalid` and every
    // photograph on a self-hosted instance failed with "hostname is not
    // configured"; hosted-Supabase users worked only by accident of the
    // wildcard.
    //
    // The cost is real and worth stating: no server-side resizing, so a phone
    // downloads the full-size photograph. Blurhash placeholders still work, and
    // anyone who wants the optimizer can build their own image with
    // NEXT_PUBLIC_SUPABASE_URL set.
    return { unoptimized: true };
  }
  const { protocol, hostname, port } = supabase;
  return {
    remotePatterns: [
      { protocol: protocol.replace(":", ""), hostname, ...(port ? { port } : {}) },
      // The demo seed's photographs.
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  };
}

/**
 * The Content-Security-Policy, and an honest account of what it does not do.
 *
 * `script-src` allows `'unsafe-inline'`, which sounds like giving up and is
 * a deliberate trade. The alternative is a per-request nonce, and a nonce
 * forces every page to render dynamically — which would undo the static
 * generation this whole app is built around, for a site whose inline-injection
 * surface is already nil: there is no `dangerouslySetInnerHTML` anywhere, and
 * react-markdown escapes HTML, so visitor-supplied text cannot become markup.
 *
 * What it does buy, and the reason it is worth setting: no script may be
 * LOADED from another origin. A compromised dependency that tries to pull code
 * from an attacker's host is blocked, which is the realistic threat here.
 *
 * Deliberately unset: default-src, img-src, connect-src, font-src. Those depend
 * on where this deployment's Supabase, map tiles and error reporting live — all
 * runtime configuration, and this header is baked at build. A guessed value
 * silently breaks photographs or the map for visitors, which is a worse outcome
 * than the narrower policy below.
 */
function contentSecurityPolicy() {
  return [
    // React Refresh needs eval in development, and only there.
    `script-src 'self' 'unsafe-inline'${
      process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""
    }`,
    // Nothing here embeds Flash-era plugins; this closes an old XSS route.
    "object-src 'none'",
    // Stops injected markup re-pointing every relative URL on the page.
    "base-uri 'self'",
    // A form that posts somewhere else is a credential-harvesting pattern.
    "form-action 'self'",
    // Clickjacking: this governs embedding only, and predates the rest.
    "frame-ancestors 'self'",
  ].join("; ");
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
  images: imageConfig(),
  eslint: {
    // Lint is run explicitly in CI; don't fail production builds on it.
    ignoreDuringBuilds: true,
  },
  // Security headers, applied to every response. X-Frame-Options and
  // frame-ancestors stop the admin (and the whole site) being framed for
  // clickjacking; nosniff, a strict referrer policy and HSTS are baseline
  // hardening. See contentSecurityPolicy() for what the CSP covers and, more
  // importantly, what it deliberately leaves alone.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: contentSecurityPolicy() },
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
