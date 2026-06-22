"use client";
import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { env } from "@/lib/env";
import { optimizedSrc } from "@/lib/utils";
import { readCookieLocale } from "@/components/i18n";
import { translate, type Locale } from "@/lib/i18n";
import type { PostTranslation, Track } from "@/lib/types";

export type MapMarker = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  href?: string;
  // Title translations, so the popup label localizes on the client (the map page
  // is statically rendered in the default locale).
  i18n?: Partial<Record<Locale, PostTranslation>>;
};

export type PhotoPin = {
  id: string;
  lat: number;
  lng: number;
  url: string;
  caption?: string | null;
  href?: string;
  takenAt?: string | null;
};

/** Chronological order (by taken_at); photos without a timestamp keep their
 *  given order and sort last. Used to number pins and connect them in time. */
export function orderPhotosByTime(photos: PhotoPin[]): PhotoPin[] {
  return [...photos].sort((a, b) => {
    const ta = a.takenAt,
      tb = b.takenAt;
    if (ta && tb) return ta < tb ? -1 : ta > tb ? 1 : 0;
    if (ta) return -1;
    if (tb) return 1;
    return 0;
  });
}

function trackEndpoints(t: Track): { start: number[]; end: number[] } | null {
  const feats = t.geojson?.features ?? [];
  const first = feats[0]?.geometry?.coordinates;
  const last = feats[feats.length - 1]?.geometry?.coordinates;
  const a = first?.[0];
  const b = last?.[last.length - 1];
  if (!a || !b) return null;
  return { start: [a[0], a[1]], end: [b[0], b[1]] };
}

/**
 * Dashed connector polylines that bridge photos to a *timed* GPX track:
 * photos taken before the track started chain into its start point, photos
 * taken after it ended chain out of its end point, and photos taken while the
 * track was recording get no line — the track already is their path. When no
 * track carries timestamps every photo is chained in chronological order
 * instead; when an untimed track exists we draw nothing (we can't tell which
 * photos it covers).
 */
export function photoConnectors(
  photos: PhotoPin[],
  tracks: Track[],
): number[][][] {
  const ordered = orderPhotosByTime(photos).filter(
    (p) => Number.isFinite(p.lng) && Number.isFinite(p.lat),
  );
  if (ordered.length === 0) return [];

  const ms = (s: string) => Date.parse(s);
  const timed = tracks
    .map((t) => ({ pts: trackEndpoints(t), s: t.started_at, e: t.ended_at }))
    .filter(
      (t): t is { pts: { start: number[]; end: number[] }; s: string; e: string } =>
        !!t.pts &&
        !!t.s &&
        !!t.e &&
        Number.isFinite(ms(t.s)) &&
        Number.isFinite(ms(t.e)),
    );

  if (timed.length === 0) {
    // No timed track to split on: chain all photos when there's no track at
    // all; with only an untimed track present, leave the photos unconnected.
    return tracks.length === 0 && ordered.length > 1
      ? [ordered.map((p) => [p.lng, p.lat])]
      : [];
  }

  const winStart = Math.min(...timed.map((t) => ms(t.s)));
  const winEnd = Math.max(...timed.map((t) => ms(t.e)));
  const startPt = timed.reduce((a, b) => (ms(a.s) <= ms(b.s) ? a : b)).pts.start;
  const endPt = timed.reduce((a, b) => (ms(a.e) >= ms(b.e) ? a : b)).pts.end;

  const pre = ordered.filter((p) => p.takenAt && ms(p.takenAt) < winStart);
  const post = ordered.filter((p) => p.takenAt && ms(p.takenAt) > winEnd);

  const lines: number[][][] = [];
  if (pre.length) lines.push([...pre.map((p) => [p.lng, p.lat]), startPt]);
  if (post.length) lines.push([endPt, ...post.map((p) => [p.lng, p.lat])]);
  return lines;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;",
  );
}

/**
 * Map of a journey: GPX routes, numbered waypoints (optionally joined by a
 * dashed line), and clickable photo pins that pop open the image.
 */
export function TripMap({
  markers = [],
  tracks = [],
  photos = [],
  route = true,
  connectPhotos = false,
  className = "h-[420px]",
}: {
  markers?: MapMarker[];
  tracks?: Track[];
  photos?: PhotoPin[];
  route?: boolean;
  /** Number the photo pins in chronological order and, when there's no GPX
   *  track, join them with a dashed line. For single-journey (per-post) maps. */
  connectPhotos?: boolean;
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  // Hold the map hidden until it has settled (tiles in, bounds fitted) and fade
  // it in — otherwise the initial bounds-jump + tile streaming + marker pop read
  // as a ~300ms flicker on first open.
  const [ready, setReady] = useState(false);

  const hasContent = markers.length > 0 || tracks.length > 0 || photos.length > 0;

  useEffect(() => {
    if (!container.current || !hasContent) return;

    // Initialise the camera at the content's bounds from the very first frame, so
    // on a slow connection we only fetch tiles for the area we actually show —
    // instead of loading a wide zoom-5 view and then fitting (downloading twice).
    const bounds = computeBounds(markers, photos, tracks);
    const single = markers.length + photos.length <= 1 && tracks.length === 0;

    const map = new maplibregl.Map({
      container: container.current,
      style: env.mapStyleUrl,
      ...(bounds
        ? {
            bounds,
            fitBoundsOptions: { padding: 64, maxZoom: single ? 12 : 16 },
          }
        : { center: [0, 20] as [number, number], zoom: 1 }),
      attributionControl: { compact: true },
    });
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(container.current);

    map.on("load", () => {
      map.resize();

      // GPX tracks
      tracks.forEach((t, i) => {
        const sourceId = `track-${t.id ?? i}`;
        map.addSource(sourceId, { type: "geojson", data: t.geojson });
        map.addLayer({
          id: sourceId,
          type: "line",
          source: sourceId,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "#f56a1f", "line-width": 4, "line-opacity": 0.9 },
        });
      });

      // Waypoint connector (only when we have no GPX and route is requested)
      if (route && tracks.length === 0 && markers.length > 1) {
        map.addSource("route", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: markers.map((m) => [m.lng, m.lat]),
            },
          },
        });
        map.addLayer({
          id: "route",
          type: "line",
          source: "route",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "#f56a1f",
            "line-width": 3,
            "line-dasharray": [1, 1.6],
            "line-opacity": 0.85,
          },
        });
      }

      // Waypoints — a click opens the popup (the "expansion"); the post link
      // inside it is the deliberate second action. Previously the marker
      // navigated on click, so the popup never had a chance to show.
      const loc = readCookieLocale();
      markers.forEach((m, i) => {
        const name = m.i18n?.[loc]?.title ?? m.name;
        const el = document.createElement("button");
        el.className =
          "grid place-items-center size-7 rounded-full bg-[#f56a1f] text-[#0a0908] text-xs font-bold ring-2 ring-white/80 shadow-lg cursor-pointer";
        el.textContent = String(i + 1);
        el.setAttribute("aria-label", name);
        const link = m.href
          ? `<a href="${m.href}" style="display:inline-block;margin-top:6px;font-size:11px;font-weight:600;letter-spacing:.01em;color:#ff8f4d;text-decoration:none">${esc(translate(loc, "map.openStory"))}</a>`
          : "";
        const html = `<div style="max-width:200px;padding-right:14px">
          <div style="font-size:13px;font-weight:600;line-height:1.35;color:#faf6f0">${esc(name)}</div>
          ${link}
        </div>`;
        new maplibregl.Marker({ element: el })
          .setLngLat([m.lng, m.lat])
          .setPopup(
            new maplibregl.Popup({
              offset: 18,
              closeButton: true,
              maxWidth: "240px",
            }).setHTML(html),
          )
          .addTo(map);
      });

      // Photo pins — numbered in chronological order, and joined by a dashed
      // "photo journey" line when there's no GPX track already drawing the route.
      const orderedPhotos = connectPhotos ? orderPhotosByTime(photos) : photos;
      const connectors = connectPhotos ? photoConnectors(photos, tracks) : [];
      if (connectors.length) {
        map.addSource("photo-path", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "MultiLineString", coordinates: connectors },
          },
        });
        map.addLayer({
          id: "photo-path",
          type: "line",
          source: "photo-path",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "#f56a1f",
            "line-width": 2.5,
            "line-dasharray": [1.5, 1.5],
            "line-opacity": 0.6,
          },
        });
      }
      orderedPhotos.forEach((p, i) => {
        const el = document.createElement("button");
        el.style.cssText =
          "position:absolute;width:38px;height:38px;border-radius:9999px;background-size:cover;background-position:center;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.5);cursor:pointer";
        el.style.backgroundImage = `url(${optimizedSrc(p.url, 128, 70)})`;
        // On the article page, clicking a photo pin scrolls to that same photo in
        // the story (the inline figure / gallery image share this id). No-op on
        // the global/trip maps, where no such element exists.
        el.addEventListener("click", () => {
          const target = document.getElementById(`photo-${p.id}`);
          if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
        });
        if (connectPhotos) {
          const badge = document.createElement("span");
          badge.textContent = String(i + 1);
          badge.style.cssText =
            "position:absolute;top:-7px;left:-7px;display:grid;place-items:center;min-width:18px;height:18px;padding:0 4px;border-radius:9999px;background:#f56a1f;color:#0a0908;font:700 11px/1 ui-sans-serif,system-ui,sans-serif;border:2px solid #0a0908;box-shadow:0 1px 3px rgba(0,0,0,.5)";
          el.appendChild(badge);
        }
        const caption = p.caption
          ? `<div style="font-size:12.5px;line-height:1.4">${esc(p.caption)}</div>`
          : "";
        const open = p.href
          ? `<div style="margin-top:${p.caption ? "8px" : "0"};font-size:11px;font-weight:600;letter-spacing:.01em;color:#ff8f4d">${esc(translate(readCookieLocale(), "map.openStory"))}</div>`
          : "";
        const body =
          caption || open
            ? `<div style="padding:11px 13px 12px">${caption}${open}</div>`
            : "";
        const html = `<a ${p.href ? `href="${p.href}"` : ""} style="display:block;width:220px;text-decoration:none;color:#faf6f0">
          <img src="${optimizedSrc(p.url, 440, 70)}" style="width:100%;height:132px;object-fit:cover;display:block" alt="" />
          ${body}
        </a>`;
        new maplibregl.Marker({ element: el })
          .setLngLat([p.lng, p.lat])
          .setPopup(
            new maplibregl.Popup({
              offset: 20,
              maxWidth: "248px",
              className: "photo-popup",
            }).setHTML(html),
          )
          .addTo(map);
      });

      // Re-fit once the container has its final size — the constructor already
      // framed it to these same bounds, so this is a no-op (no extra tiles)
      // unless the box sized late, in which case it corrects the framing.
      if (bounds) {
        map.fitBounds(bounds, {
          padding: 64,
          maxZoom: single ? 12 : 16,
          duration: 0,
        });
      }
      // Reveal once the first frame is fully rendered (tiles + markers settled).
      map.once("idle", () => setReady(true));
    });

    // Safety net: never leave the map hidden if `idle` is slow to fire.
    const reveal = setTimeout(() => setReady(true), 2000);

    return () => {
      clearTimeout(reveal);
      ro.disconnect();
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!hasContent) return null;

  // The map element itself is left untouched (opacity/transform on it breaks
  // MapLibre's canvas positioning). Instead a sibling overlay covers it during
  // load and fades out — hiding the bounds-jump / tile-pop flicker.
  return (
    <div className={`relative w-full ${className}`}>
      <div
        ref={container}
        className="h-full w-full overflow-hidden rounded-3xl ring-1 ring-white/10"
      />
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 rounded-3xl bg-ink-900 transition-opacity duration-300 ${ready ? "opacity-0" : "opacity-100"}`}
      />
    </div>
  );
}

// The bounding box of everything we'll draw (markers, photo pins, GPX), so the
// map can open already framed on it — no wide initial view, no second fetch.
export function computeBounds(
  markers: MapMarker[],
  photos: PhotoPin[],
  tracks: Track[],
): maplibregl.LngLatBounds | null {
  const b = new maplibregl.LngLatBounds();
  let any = false;
  const add = (lng: number, lat: number) => {
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      b.extend([lng, lat]);
      any = true;
    }
  };
  markers.forEach((m) => add(m.lng, m.lat));
  photos.forEach((p) => add(p.lng, p.lat));
  for (const t of tracks) {
    for (const f of t.geojson?.features ?? []) {
      for (const c of f.geometry?.coordinates ?? []) add(c[0], c[1]);
    }
  }
  return any ? b : null;
}
