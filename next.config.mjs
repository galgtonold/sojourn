import { withSentryConfig } from "@sentry/nextjs";
import { createRequire } from "node:module";

// The maplibre version this build copied into public/ (see
// scripts/copy-maplibre-worker.mjs). It rides along as a query on the worker URL
// so an upgrade can never leave a browser pairing a cached old worker with a new
// bundle. Inlining it at build time is right here — unlike the Supabase URL, it
// describes the BUILD rather than the deployment, and the file it names was put
// there by this same build.
const maplibreVersion = createRequire(import.meta.url)("maplibre-gl/package.json").version;

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
    // MapLibre builds its Web Worker from a blob: URL, and `worker-src` falls
    // back to `script-src` when unset — so the line above silently killed every
    // map on the site the moment it shipped. Stated separately rather than by
    // adding blob: to script-src, which would let injected markup run a blob as
    // a page script too.
    //
    // It failed quietly in a way worth remembering: `new Worker(blobUrl)` does
    // NOT throw when CSP blocks it, so a probe that only checked for an
    // exception reported success. The evidence was a `blob:` request marked
    // FAILED in the network log, and an `onerror` on the worker itself.
    "worker-src 'self' blob:",
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
  // Publish a story, walk to the home page, and see the site as it was before
  // you wrote it. Next 15.5 ships `staleTimes: { dynamic: 0, static: 300 }`,
  // and every index route here is prerendered — so a SOFT navigation re-uses
  // the RSC payload the client already holds, for five minutes, without
  // asking. A hard refresh looks like the fix, which is exactly why this reads
  // as a fluke rather than a setting.
  //
  // Worth being precise about what it is not, because both were suspected
  // first: the server is right (`revalidatePath` runs on publish, and a fresh
  // request renders the new story immediately), and so is the service worker
  // (its navigation handler is network-first, and a reload with the worker in
  // control returns the new page).
  //
  // `static: 0` means revalidate, not re-render — the server still answers
  // from the ISR cache, so this costs one RSC request per navigation and buys
  // a site that is never confidently wrong about its own contents.
  experimental: { staleTimes: { dynamic: 0, static: 0 } },
  // Emit a self-contained server bundle so the same image runs on Vercel,
  // any container host, or a bare VPS (`node .next/standalone/server.js`).
  output: "standalone",
  // Pin the file-tracing root to this project so a stray lockfile in a parent
  // directory can't make Next infer the wrong workspace root (the dev warning).
  outputFileTracingRoot: import.meta.dirname,
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_SW_VERSION: swVersion,
    NEXT_PUBLIC_MAPLIBRE_VERSION: maplibreVersion,
  },
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
