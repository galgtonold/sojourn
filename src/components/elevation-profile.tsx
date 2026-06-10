import { Mountain, TrendingDown, TrendingUp } from "lucide-react";
import {
  buildElevationSeries,
  formatDistance,
  type ElevationSeries,
} from "@/lib/gpx";
import type { Track } from "@/lib/types";
import { cn } from "@/lib/utils";
import { T } from "@/components/i18n";
import { ElevationChart } from "@/components/elevation-chart";

/** Renders a distance-vs-elevation chart per track that carries elevation. */
export function ElevationProfile({
  tracks,
  wrapClassName = "mx-auto max-w-3xl px-6",
  colClassName = "",
}: {
  tracks: Track[];
  wrapClassName?: string;
  colClassName?: string;
}) {
  const series = tracks
    .map((t) => ({ t, s: buildElevationSeries(t.geojson) }))
    .filter((x): x is { t: Track; s: ElevationSeries } => x.s !== null);

  if (series.length === 0) return null;

  return (
    <section className={cn(wrapClassName, "pb-14")}>
      <div className={colClassName}>
        <h2 className="mb-5 font-display text-2xl font-semibold">
          <T k="post.elevation" />
        </h2>
        <div className="space-y-6">
        {series.map(({ t, s }) => (
          <div
            key={t.id}
            className="rounded-3xl bg-ink-900 p-5 ring-1 ring-white/5"
          >
            <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-sand-100/70">
              <span className="font-medium text-sand-50">
                {t.name || <T k="post.routeFallback" />}
              </span>
              <span>{formatDistance(s.distanceM)}</span>
              <span className="flex items-center gap-1.5">
                <TrendingUp className="size-4 text-ember-400" />
                {Math.round(s.ascent)} m
              </span>
              <span className="flex items-center gap-1.5">
                <TrendingDown className="size-4 text-lagoon-400" />
                {Math.round(s.descent)} m
              </span>
              <span className="flex items-center gap-1.5">
                <Mountain className="size-4 text-sand-100/50" />
                {Math.round(s.max)} m
              </span>
            </div>
            <ElevationChart series={s} />
          </div>
        ))}
        </div>
      </div>
    </section>
  );
}
