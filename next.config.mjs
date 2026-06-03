/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit a self-contained server bundle so the same image runs on Vercel,
  // any container host, or a bare VPS (`node .next/standalone/server.js`).
  output: "standalone",
  reactStrictMode: true,
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
