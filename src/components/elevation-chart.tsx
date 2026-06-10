"use client";
import { useId, useRef, useState } from "react";
import { formatDistance, type ElevationSeries } from "@/lib/gpx";
import { useT } from "@/components/i18n";

/**
 * Distance-vs-elevation chart. Hover (or drag on touch) to read the exact
 * elevation and distance at any point along the track — a guide line, a marker
 * dot, and a small readout follow the cursor.
 */
export function ElevationChart({ series }: { series: ElevationSeries }) {
  const { points, distanceM, min, max } = series;
  const W = 1000;
  const H = 240;
  const pad = 8;
  const range = Math.max(1, max - min);
  const px = (d: number) => (d / Math.max(1, distanceM)) * W;
  const py = (e: number) => H - pad - ((e - min) / range) * (H - 2 * pad);

  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${px(p.d).toFixed(1)},${py(p.e).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;
  const gid = useId();
  const t = useT();

  const ref = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState<number | null>(null);

  // Map an x screen position to the nearest sample by cumulative distance.
  function locate(clientX: number) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const d = f * distanceM;
    let lo = 0;
    let hi = points.length - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (points[m].d < d) lo = m + 1;
      else hi = m;
    }
    if (lo > 0 && Math.abs(points[lo - 1].d - d) < Math.abs(points[lo].d - d)) {
      lo -= 1;
    }
    setIdx(lo);
  }

  const cur = idx != null ? points[idx] : null;
  const leftPct = cur ? (cur.d / Math.max(1, distanceM)) * 100 : 0;
  const topPct = cur ? (py(cur.e) / H) * 100 : 0;

  return (
    <div
      ref={ref}
      className="relative cursor-crosshair touch-pan-y"
      onPointerMove={(e) => locate(e.clientX)}
      onPointerDown={(e) => locate(e.clientX)}
      onPointerLeave={() => setIdx(null)}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-40 w-full"
        role="img"
        aria-label={t("post.elevationAria")}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f56a1f" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#f56a1f" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gid})`} />
        <path
          d={line}
          fill="none"
          stroke="#ff8f4d"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {cur && (
        <>
          <div
            className="pointer-events-none absolute inset-y-0 w-px bg-white/40"
            style={{ left: `${leftPct}%` }}
          />
          <div
            className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ember-400 ring-2 ring-ink-950"
            style={{ left: `${leftPct}%`, top: `${topPct}%` }}
          />
          <div
            className="pointer-events-none absolute top-1 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink-950/90 px-2 py-1 text-xs ring-1 ring-white/10"
            style={{ left: `${Math.min(92, Math.max(8, leftPct))}%` }}
          >
            <span className="font-semibold text-ember-300">
              {Math.round(cur.e)} m
            </span>
            <span className="ml-2 text-sand-100/70">{formatDistance(cur.d)}</span>
          </div>
        </>
      )}
    </div>
  );
}
