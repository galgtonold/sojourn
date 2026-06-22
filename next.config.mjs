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
};

export default nextConfig;
