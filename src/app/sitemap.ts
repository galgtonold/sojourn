import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { getPostSummaries, getTrips } from "@/lib/content";

// Enumerate every public surface so crawlers can discover all posts and trips.
// Static, regenerated on demand alongside the rest of the ISR content.
export const revalidate = false;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.siteUrl.replace(/\/$/, "");

  const staticRoutes: MetadataRoute.Sitemap = [
    "",
    "/posts",
    "/trips",
    "/map",
    "/photos",
    "/search",
  ].map((path) => ({ url: `${base}${path}`, changeFrequency: "weekly" }));

  let posts: MetadataRoute.Sitemap = [];
  let trips: MetadataRoute.Sitemap = [];
  try {
    const { posts: list } = await getPostSummaries({ limit: 1000 });
    posts = list.map((p) => ({
      url: `${base}/posts/${p.slug}`,
      lastModified: p.published_at ?? undefined,
      changeFrequency: "monthly",
    }));
  } catch {
    // A sitemap that omits a transiently-unreachable section is better than 500.
  }
  try {
    const all = await getTrips();
    trips = all.flatMap((t) => [
      { url: `${base}/trips/${t.slug}`, changeFrequency: "monthly" as const },
      { url: `${base}/trips/${t.slug}/map`, changeFrequency: "monthly" as const },
    ]);
  } catch {
    // ditto
  }

  return [...staticRoutes, ...posts, ...trips];
}
