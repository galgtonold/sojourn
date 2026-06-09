"use client";
import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { env } from "@/lib/env";
import { optimizedSrc } from "@/lib/utils";
import { readCookieLocale } from "@/components/i18n";
import { translate } from "@/lib/i18n";
import type { Track } from "@/lib/types";

export type MapMarker = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  href?: string;
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

  const hasContent = markers.length > 0 || tracks.length > 0 || photos.length > 0;

  useEffect(() => {
    if (!container.current || !hasContent) return;

    const first =
      markers[0] ??
      (photos[0] ? { lng: photos[0].lng, lat: photos[0].lat } : null) ??
      firstTrackPoint(tracks);

    const map = new maplibregl.Map({
      container: container.current,
      style: env.mapStyleUrl,
      center: first ? [first.lng, first.lat] : [0, 20],
      zoom: 5,
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
      const bounds = new maplibregl.LngLatBounds();
      const extend = (lng: number, lat: number) => bounds.extend([lng, lat]);

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
        for (const f of t.geojson?.features ?? []) {
          for (const c of f.geometry?.coordinates ?? []) extend(c[0], c[1]);
        }
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
      markers.forEach((m, i) => {
        extend(m.lng, m.lat);
        const el = document.createElement("button");
        el.className =
          "grid place-items-center size-7 rounded-full bg-[#f56a1f] text-[#0a0908] text-xs font-bold ring-2 ring-white/80 shadow-lg cursor-pointer";
        el.textContent = String(i + 1);
        el.setAttribute("aria-label", m.name);
        const link = m.href
          ? `<a href="${m.href}" style="display:inline-block;margin-top:6px;font-size:11px;font-weight:600;letter-spacing:.01em;color:#ff8f4d;text-decoration:none">${esc(translate(readCookieLocale(), "map.openStory"))}</a>`
          : "";
        const html = `<div style="max-width:200px;padding-right:14px">
          <div style="font-size:13px;font-weight:600;line-height:1.35;color:#faf6f0">${esc(m.name)}</div>
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
        extend(p.lng, p.lat);
        const el = document.createElement("button");
        el.style.cssText =
          "position:absolute;width:38px;height:38px;border-radius:9999px;background-size:cover;background-position:center;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.5);cursor:pointer";
        el.style.backgroundImage = `url(${optimizedSrc(p.url, 128, 70)})`;
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

      if (!bounds.isEmpty()) {
        const single =
          markers.length + photos.length <= 1 && tracks.length === 0;
        map.fitBounds(bounds, {
          padding: 64,
          maxZoom: single ? 9 : 14,
          duration: 0,
        });
      }
    });

    return () => {
      ro.disconnect();
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!hasContent) return null;

  return (
    <div
      ref={container}
      className={`w-full overflow-hidden rounded-3xl ring-1 ring-white/10 ${className}`}
    />
  );
}

function firstTrackPoint(tracks: Track[]): { lng: number; lat: number } | null {
  for (const t of tracks) {
    const c = t.geojson?.features?.[0]?.geometry?.coordinates?.[0];
    if (c) return { lng: c[0], lat: c[1] };
  }
  return null;
}
