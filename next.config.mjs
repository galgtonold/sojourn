// A value that changes on every deploy, exposed to the client so the service
// worker can name its cache per-build and purge the previous one on activate.
// A static cache name (the old "v1") never updates, so stale assets accumulate
// forever and get served on cached loads — see sw.js / service-worker.tsx.
const swVersion =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || String(Date.now());

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

export default nextConfig;
