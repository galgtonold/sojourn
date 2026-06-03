import { Mountain, TrendingDown, TrendingUp } from "lucide-react";
import {
  buildElevationSeries,
  formatDistance,
  type ElevationSeries,
} from "@/lib/gpx";
import type { Track } from "@/lib/types";

function ProfileChart({ series }: { series: ElevationSeries }) {
  const W = 1000;
  const H = 240;
  const pad = 8;
  const { points, distanceM, min, max } = series;
  const range = Math.max(1, max - min);
  const x = (d: number) => (d / Math.max(1, distanceM)) * W;
  const y = (e: number) => H - pad - ((e - min) / range) * (H - 2 * pad);

  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.d).toFixed(1)},${y(p.e).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="h-40 w-full"
      role="img"
      aria-label="Elevation profile"
    >
      <defs>
        <linearGradient id="elev-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f56a1f" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#f56a1f" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#elev-fill)" />
      <path
        d={line}
        fill="none"
        stroke="#ff8f4d"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Renders a distance-vs-elevation chart per track that carries elevation. */
export function ElevationProfile({ tracks }: { tracks: Track[] }) {
  const series = tracks
    .map((t) => ({ t, s: buildElevationSeries(t.geojson) }))
    .filter((x): x is { t: Track; s: ElevationSeries } => x.s !== null);

  if (series.length === 0) return null;

  return (
    <section className="mx-auto max-w-4xl px-6 pb-14">
      <h2 className="mb-5 font-display text-2xl font-semibold">Elevation</h2>
      <div className="space-y-6">
        {series.map(({ t, s }) => (
          <div
            key={t.id}
            className="rounded-3xl bg-ink-900 p-5 ring-1 ring-white/5"
          >
            <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-sand-100/70">
              <span className="font-medium text-sand-50">
                {t.name || "Route"}
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
            <ProfileChart series={s} />
          </div>
        ))}
      </div>
    </section>
  );
}
