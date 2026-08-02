"use client";
import dynamic from "next/dynamic";
import type { AnalyticsProvider } from "@/lib/telemetry-fields";

// Analytics, only if the owner asked for it.
//
// `<Analytics />` used to render unconditionally, which was wrong in both
// directions. Self-hosted anywhere but Vercel it requested
// /_vercel/insights/script.js on every page view and got a 404 — a failed
// request per visit, forever. Self-hosted ON Vercel it quietly began
// collecting visitor data under the operator's own project: their data, their
// legal exposure, and a decision nobody showed them.
//
// The provider is now resolved on the server (owner's setting → env → off) and
// passed in, so it can be changed from /admin/settings without a redeploy —
// the barrier the first-run setup work exists to remove.
//
// The import stays dynamic: with analytics off the chunk is built but never
// requested, so a visitor to an install that hasn't enabled it downloads
// nothing extra.
const VercelAnalytics = dynamic(
  () => import("@vercel/analytics/next").then((m) => m.Analytics),
  { ssr: false },
);

export function SiteAnalytics({ provider }: { provider: AnalyticsProvider }) {
  if (provider !== "vercel") return null;
  return <VercelAnalytics />;
}
