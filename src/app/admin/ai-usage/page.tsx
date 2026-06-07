import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getServerSupabase } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { getViewer } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import { T, DocumentTitle } from "@/components/i18n";
import { defaultTitle } from "@/lib/i18n";

export const metadata = { title: defaultTitle("meta.aiUsage") };
export const dynamic = "force-dynamic";

type Summary = {
  total_cost: number;
  month_cost: number;
  tokens: number;
  cache_hit: number;
  cache_total: number;
  calls: number;
  by_op: Record<string, { calls: number; cost: number }>;
} | null;

function usd(n: number): string {
  return `$${(n ?? 0).toFixed(n < 1 ? 4 : 2)}`;
}

export default async function AiUsagePage() {
  if (!isSupabaseConfigured) redirect("/admin");
  const viewer = await getViewer();
  if (!viewer.isOwner) redirect("/admin");

  const supabase = await getServerSupabase();
  const [{ data: summary }, { data: recent }] = await Promise.all([
    supabase!.rpc("ai_usage_summary"),
    supabase!
      .from("ai_usage")
      .select("created_at, operation, model, prompt_tokens, completion_tokens, cost_usd")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const s = summary as Summary;
  const cacheRate =
    s && s.cache_total > 0 ? Math.round((s.cache_hit / s.cache_total) * 100) : 0;

  const stat = (label: React.ReactNode, value: string) => (
    <div className="rounded-2xl bg-ink-900 p-5 ring-1 ring-white/5">
      <p className="font-display text-3xl font-semibold">{value}</p>
      <p className="mt-1 text-sm text-sand-100/50">{label}</p>
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl px-6 pb-24 pt-28">
      <DocumentTitle k="meta.aiUsage" />
      <Link
        href="/admin"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-sand-100/70 hover:text-ember-400"
      >
        <ArrowLeft className="size-4" /> <T k="admin.dashboardLink" />
      </Link>
      <h1 className="font-display text-4xl font-semibold">
        <T k="admin.usage.title" />
      </h1>
      <p className="mb-8 mt-2 text-sm text-sand-100/50">
        <T k="admin.usage.subtitle" />
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stat(<T k="admin.usage.month" />, usd(s?.month_cost ?? 0))}
        {stat(<T k="admin.usage.total" />, usd(s?.total_cost ?? 0))}
        {stat(<T k="admin.usage.calls" />, String(s?.calls ?? 0))}
        {stat(<T k="admin.usage.cacheRate" />, `${cacheRate}%`)}
      </div>

      {s && Object.keys(s.by_op ?? {}).length > 0 && (
        <>
          <h2 className="mt-10 font-display text-2xl font-semibold">
            <T k="admin.usage.byOp" />
          </h2>
          <ul className="mt-4 divide-y divide-white/5 overflow-hidden rounded-2xl bg-ink-900 ring-1 ring-white/5">
            {Object.entries(s.by_op).map(([op, v]) => (
              <li key={op} className="flex items-center justify-between px-5 py-3 text-sm">
                <span className="font-medium">{op}</span>
                <span className="text-sand-100/60">
                  {v.calls} · {usd(v.cost)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 className="mt-10 font-display text-2xl font-semibold">
        <T k="admin.usage.recent" />
      </h2>
      {(recent ?? []).length === 0 ? (
        <p className="mt-4 text-sand-100/50">
          <T k="admin.usage.none" />
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-white/5 overflow-hidden rounded-2xl bg-ink-900 ring-1 ring-white/5">
          {(recent ?? []).map((r, i) => (
            <li key={i} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-sand-100/70">
                  {r.operation}
                </span>
                <span className="truncate text-sand-100/50">{r.model}</span>
              </span>
              <span className="flex shrink-0 items-center gap-3 text-sand-100/50">
                <span className="hidden sm:inline">
                  {(r.prompt_tokens + r.completion_tokens).toLocaleString()} tok
                </span>
                <span className="tabular-nums">{usd(r.cost_usd)}</span>
                <span className="hidden text-xs text-sand-100/30 sm:inline">
                  {formatDate(r.created_at)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
