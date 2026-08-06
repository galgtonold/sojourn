import type { Metadata } from "next";
import { NotFoundView } from "@/components/not-found-view";

// Keep every not-found render out of search indexes. Next.js serves `notFound()`
// from a statically-prerendered dynamic route (e.g. an unknown or deleted
// /posts/[slug]) with a 200 status rather than 404 — and `dynamicParams` must
// stay `true` so newly-published slugs render on demand without a redeploy. So a
// real 404 status isn't available here without regressing on-demand publishing;
// `noindex` ensures crawlers still never index a missing/deleted page.
// Guarded by test/unit/not-found-noindex.test.ts.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return <NotFoundView />;
}
