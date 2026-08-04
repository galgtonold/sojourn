import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

// Allow crawling of public content; keep the admin and API surfaces out of the
// index. The sitemap pointer helps crawlers find every post/trip.
//
// Regenerated hourly for the same reason as the sitemap: both spell out the
// site URL, and a prebuilt image does not know it at build time. Frozen, this
// file told every crawler that the host was http://localhost:3000.
export const revalidate = 3600;
export default function robots(): MetadataRoute.Robots {
  const base = env.siteUrl.replace(/\/$/, "");
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api"],
    },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
