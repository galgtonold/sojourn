"use client";
import dynamic from "next/dynamic";
import { env } from "@/lib/env";

// Analytics, only if the operator asked for it.
//
// `<Analytics />` used to render unconditionally in the root layout, which was
// wrong in both directions. Self-hosted anywhere but Vercel it requests
// /_vercel/insights/script.js on every page view and gets a 404 — a failed
// request per visit, forever. Self-hosted ON Vercel it quietly starts
// collecting visitor data under the operator's own project: their data, their
// legal responsibility, and a decision nobody showed them.
//
// Neither is acceptable in software people run for themselves, so it is off
// until `NEXT_PUBLIC_ANALYTICS=vercel` says otherwise.
//
// The import is dynamic so the package isn't merely inert when unset — it is
// absent. `env.analytics` is inlined at build time, so for every other value
// the branch below is dead code and the chunk is never requested.
const VercelAnalytics = dynamic(
  () => import("@vercel/analytics/next").then((m) => m.Analytics),
  { ssr: false },
);

export function SiteAnalytics() {
  if (env.analytics !== "vercel") return null;
  return <VercelAnalytics />;
}
