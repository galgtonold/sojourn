"use client";
import { useState } from "react";
import { ChevronDown, TrendingDown, TrendingUp } from "lucide-react";
import { formatDistance, type ElevationSeries } from "@/lib/gpx";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n";
import { ElevationChart } from "@/components/elevation-chart";

export type CondensedElevationItem = {
  id: string;
  name: string | null;
  series: ElevationSeries;
};

/**
 * The elevation section for a post with many tracks: a day-total header plus one
 * compact, tappable row per track. Each track's chart expands inline on demand,
 * so a 9-track day is a short scannable list instead of nine stacked charts.
 */
export function CondensedElevation({ items }: { items: CondensedElevationItem[] }) {
  const t = useT();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const total = items.reduce(
    (a, x) => ({
      dist: a.dist + x.series.distanceM,
      up: a.up + x.series.ascent,
      down: a.down + x.series.descent,
    }),
    { dist: 0, up: 0, down: 0 },
  );

  return (
    <div className="overflow-hidden rounded-3xl bg-ink-900 ring-1 ring-white/5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-white/5 px-5 py-4 text-sm text-sand-100/70">
        <span className="font-medium text-sand-50">
          {t("post.elevation.dayTotal", { n: items.length })}
        </span>
        <span>{formatDistance(total.dist)}</span>
        <span className="flex items-center gap-1.5">
          <TrendingUp className="size-4 text-ember-400" />
          {Math.round(total.up)} m
        </span>
        <span className="flex items-center gap-1.5">
          <TrendingDown className="size-4 text-sage-400" />
          {Math.round(total.down)} m
        </span>
      </div>
      <ul className="divide-y divide-white/5">
        {items.map((it) => {
          const isOpen = open.has(it.id);
          return (
            <li key={it.id}>
              <button
                type="button"
                onClick={() => toggle(it.id)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-3 px-5 py-3 text-left text-sm transition hover:bg-white/[0.03]"
              >
                <span className="min-w-0 flex-1 truncate font-medium text-sand-50">
                  {it.name || t("post.routeFallback")}
                </span>
                <span className="shrink-0 text-sand-100/70">
                  {formatDistance(it.series.distanceM)}
                </span>
                <span className="flex shrink-0 items-center gap-1 text-sand-100/70">
                  <TrendingUp className="size-3.5 text-ember-400" />
                  {Math.round(it.series.ascent)}
                </span>
                <span className="hidden shrink-0 items-center gap-1 text-sand-100/70 sm:flex">
                  <TrendingDown className="size-3.5 text-sage-400" />
                  {Math.round(it.series.descent)}
                </span>
                <ChevronDown
                  className={cn(
                    "size-4 shrink-0 text-sand-100/50 transition-transform",
                    isOpen && "rotate-180",
                  )}
                />
              </button>
              {isOpen && (
                <div className="px-5 pb-5 pt-1">
                  <ElevationChart series={it.series} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
