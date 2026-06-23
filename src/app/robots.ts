import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

// Allow crawling of public content; keep the admin and API surfaces out of the
// index. The sitemap pointer helps crawlers find every post/trip.
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
