"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { env } from "@/lib/env";
import { cn, optimizedSrc } from "@/lib/utils";
import { blurhashToDataURL } from "@/lib/blurhash";
import { initialView } from "@/components/trip-map";
import { useI18n } from "@/components/i18n";
import type { GeoPhoto } from "@/lib/content";

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;",
  );
}

/**
 * The /photos experience: a clustered map of every geotagged photo paired with
 * a filmstrip, kept in two-way sync.
 *   • Pan/zoom the map → the filmstrip filters to what's in view.
 *   • Hover a thumbnail → its pin is highlighted on the map.
 *   • Click a thumbnail (or a pin) → the map flies to it and opens the photo;
 *     the filmstrip scrolls that thumbnail into view.
 */
export function PhotoExplorer({ photos: rawPhotos }: { photos: GeoPhoto[] }) {
  const { t, locale } = useI18n();
  const container = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  // True only while a *map-originated* selection is pending, so the filmstrip
  // reveals that thumbnail. Hovering thumbnails must NOT scroll the strip.
  const fromMapRef = useRef(false);

  // Localize caption + parent-post title to the reader's language on the client
  // (both languages ship raw in the static payload), then everything downstream
  // — popups, filmstrip, aria-labels — reads the localized copy.
  const photos = useMemo(
    () =>
      rawPhotos.map((p) => ({
        ...p,
        caption: p.i18n?.[locale]?.caption ?? p.caption,
        postTitle: p.postI18n?.[locale]?.title ?? p.postTitle,
      })),
    [rawPhotos, locale],
  );

  const photoById = useMemo(() => {
    const m = new Map<string, GeoPhoto>();
    for (const p of photos) m.set(p.id, p);
    return m;
  }, [photos]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Hold the map hidden until it has settled, then fade in — avoids the initial
  // bounds-jump + tile/cluster pop flicker.
  const [ready, setReady] = useState(false);
  // ids of photos within the current map viewport — drives the filmstrip.
  const [visibleIds, setVisibleIds] = useState<string[]>(() =>
    photos.map((p) => p.id),
  );

  // Fly to a photo, highlight it, and pop it open. Kept in a ref so the map's
  // (once-built) event handlers always call the latest closure.
  const focusPhoto = useCallback(
    (id: string) => {
      const p = photoById.get(id);
      const map = mapRef.current;
      if (!p || !map) return;
      setSelectedId(id);
      // Just recentre at the current zoom — zooming in would leave only this
      // one photo in view and re-cluster everything else away.
      map.flyTo({
        center: [p.lng, p.lat],
        speed: 0.8,
        essential: true,
      });
      popupRef.current?.remove();
      // Same shape as the per-post TripMap photo popups (.photo-popup): a flush
      // cover image with the caption + "open story" link in a padded footer.
      const caption = p.caption
        ? `<div style="font-size:12.5px;line-height:1.4">${esc(p.caption)}</div>`
        : "";
      const open = `<div style="margin-top:${p.caption ? "8px" : "0"};font-size:11px;font-weight:600;letter-spacing:.01em;color:#ff8f4d">${esc(t("map.openStory"))}</div>`;
      const html = `<a href="/posts/${esc(p.postSlug)}#photo-${esc(p.id)}" style="display:block;width:220px;text-decoration:none;color:#faf6f0">
          <img src="${optimizedSrc(p.url, 440, 70)}" style="width:100%;height:132px;object-fit:cover;display:block" alt="" />
          <div style="padding:11px 13px 12px">${caption}${open}</div>
        </a>`;
      popupRef.current = new maplibregl.Popup({
        offset: 20,
        maxWidth: "248px",
        className: "photo-popup",
      })
        .setLngLat([p.lng, p.lat])
        .setHTML(html)
        .addTo(map);
    },
    [photoById, t],
  );
  const focusRef = useRef(focusPhoto);
  focusRef.current = focusPhoto;

  // Build the map once.
  useEffect(() => {
    if (!container.current || photos.length === 0) return;
    // Open already framed on all the photos (computed center + zoom) so we don't
    // load a wide Scandinavia view first and then fit out to all of Europe.
    const photoBounds = new maplibregl.LngLatBounds();
    for (const p of photos) {
      if (Number.isFinite(p.lng) && Number.isFinite(p.lat))
        photoBounds.extend([p.lng, p.lat]);
    }
    const view = initialView(
      photoBounds.isEmpty() ? null : photoBounds,
      photos.length <= 1 ? 9 : 14,
    );
    const map = new maplibregl.Map({
      container: container.current,
      style: env.mapStyleUrl,
      center: view ? view.center : [photos[0].lng, photos[0].lat],
      zoom: view ? view.zoom : 4,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(container.current);

    const recomputeVisible = () => {
      const b = map.getBounds();
      setVisibleIds(
        photos.filter((p) => b.contains([p.lng, p.lat])).map((p) => p.id),
      );
    };

    // Un-clustered photos render as circular thumbnail markers (HTML), created
    // once and reconciled on every render — clusters stay as the circle layer.
    const markers: Record<string, maplibregl.Marker> = {};
    let onScreen: Record<string, maplibregl.Marker> = {};
    const makeThumb = (p: GeoPhoto) => {
      const el = document.createElement("button");
      el.setAttribute("aria-label", p.caption ?? p.postTitle ?? "");
      el.style.cssText =
        "width:42px;height:42px;border-radius:9999px;background-size:cover;background-position:center;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.5);cursor:pointer;display:block;padding:0";
      // Paint the blurhash instantly, then swap in the real thumbnail once it
      // loads — no white ring with an empty centre while the image downloads.
      const placeholder = blurhashToDataURL(p.blurhash, 24, 24);
      const real = optimizedSrc(p.url, 96, 65);
      el.style.backgroundImage = `url(${placeholder ?? real})`;
      if (placeholder) {
        const pre = new Image();
        pre.onload = () => {
          el.style.backgroundImage = `url(${real})`;
        };
        pre.src = real;
      }
      el.onmouseenter = () => setSelectedId(p.id);
      el.onclick = (ev) => {
        ev.stopPropagation();
        fromMapRef.current = true; // a pin click should reveal its thumbnail
        focusRef.current(p.id);
      };
      return el;
    };
    const updateMarkers = () => {
      const next: Record<string, maplibregl.Marker> = {};
      for (const f of map.querySourceFeatures("photos")) {
        const props = f.properties ?? {};
        if (props.cluster) continue;
        const id = props.id as string;
        if (!id || next[id]) continue;
        let marker = markers[id];
        if (!marker) {
          const p = photoById.get(id);
          if (!p) continue;
          marker = markers[id] = new maplibregl.Marker({
            element: makeThumb(p),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          }).setLngLat((f.geometry as any).coordinates);
        }
        next[id] = marker;
        if (!onScreen[id]) marker.addTo(map);
      }
      for (const id in onScreen) if (!next[id]) onScreen[id].remove();
      onScreen = next;
    };

    map.on("load", () => {
      map.resize();
      const bounds = new maplibregl.LngLatBounds();
      photos.forEach((p) => bounds.extend([p.lng, p.lat]));

      map.addSource("photos", {
        type: "geojson",
        cluster: true,
        clusterRadius: 40,
        clusterMaxZoom: 12,
        data: {
          type: "FeatureCollection",
          features: photos.map((p) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [p.lng, p.lat] },
            properties: { id: p.id },
          })),
        },
      });
      map.addLayer({
        id: "photo-clusters",
        type: "circle",
        source: "photos",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#f56a1f",
          "circle-opacity": 0.92,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fff",
          "circle-radius": ["step", ["get", "point_count"], 16, 10, 22, 50, 30],
        },
      });
      map.addLayer({
        id: "photo-cluster-count",
        type: "symbol",
        source: "photos",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 12,
        },
        paint: { "text-color": "#0a0908" },
      });
      // Highlight halo for the selected photo — drawn under the points so the
      // pin still sits crisply on top.
      map.addSource("selected", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "selected-halo",
        type: "circle",
        source: "selected",
        paint: {
          "circle-radius": 27,
          "circle-color": "#f56a1f",
          "circle-opacity": 0.45,
          "circle-blur": 0.35,
        },
      });

      if (!bounds.isEmpty()) {
        const single = photos.length <= 1;
        map.fitBounds(bounds, {
          padding: 64,
          maxZoom: single ? 9 : 14,
          duration: 0,
        });
      }
      map.once("idle", () => {
        recomputeVisible();
        setReady(true);
      });
      map.on("moveend", recomputeVisible);

      map.on("click", "photo-clusters", (e) => {
        const feature = map.queryRenderedFeatures(e.point, {
          layers: ["photo-clusters"],
        })[0];
        const clusterId = feature?.properties?.cluster_id;
        if (clusterId == null) return;
        const src = map.getSource("photos") as maplibregl.GeoJSONSource;
        const count = (feature.properties?.point_count as number) ?? 100;
        // Zoom in as far as still fits the WHOLE cluster, rather than the single
        // split-step getClusterExpansionZoom gives (which needs many clicks
        // through tiny sub-clusters).
        src.getClusterLeaves(clusterId, count, 0).then((leaves) => {
          const b = new maplibregl.LngLatBounds();
          for (const lf of leaves) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const c = (lf.geometry as any).coordinates;
            b.extend([c[0], c[1]]);
          }
          if (!b.isEmpty())
            map.fitBounds(b, { padding: 80, maxZoom: 16, duration: 600 });
        });
      });
      map.on("mouseenter", "photo-clusters", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "photo-clusters", () => {
        map.getCanvas().style.cursor = "";
      });
      // Keep the thumbnail markers in sync with the un-clustered leaves.
      map.on("render", () => {
        if (map.isSourceLoaded("photos")) updateMarkers();
      });
    });

    // Safety net: never leave the map hidden if `idle` is slow to fire.
    const reveal = setTimeout(() => setReady(true), 2000);

    return () => {
      clearTimeout(reveal);
      ro.disconnect();
      popupRef.current?.remove();
      popupRef.current = null;
      for (const id in markers) markers[id].remove();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reflect the current selection as the map highlight halo.
  useEffect(() => {
    const map = mapRef.current;
    const src = map?.getSource("selected") as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!src) return;
    const p = selectedId ? photoById.get(selectedId) : null;
    src.setData({
      type: "FeatureCollection",
      features: p
        ? [
            {
              type: "Feature",
              geometry: { type: "Point", coordinates: [p.lng, p.lat] },
              properties: {},
            },
          ]
        : [],
    });
  }, [selectedId, photoById]);

  // Reveal the selected thumbnail in the strip — but ONLY when the selection
  // came from the map (a pin click), never on hover. Centring on every hover
  // made the strip lurch away from the cursor.
  useEffect(() => {
    if (!selectedId || !fromMapRef.current) return;
    fromMapRef.current = false;
    const el = stripRef.current?.querySelector(`[data-id="${selectedId}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [selectedId]);

  const visibleSet = useMemo(() => new Set(visibleIds), [visibleIds]);
  const shown = useMemo(
    () => photos.filter((p) => visibleSet.has(p.id)),
    [photos, visibleSet],
  );

  return (
    <div className="overflow-hidden rounded-3xl ring-1 ring-white/10">
      {/* The map element is left untouched; a sibling overlay fades out once the
          map has settled, hiding the load flicker without moving the canvas. */}
      <div className="relative">
        <div ref={container} className="h-[58dvh] min-h-[400px] w-full" />
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 bg-ink-900 transition-opacity duration-300",
            ready ? "opacity-0" : "opacity-100",
          )}
        />
      </div>

      <div className="border-t border-white/10 bg-ink-900/80">
        <p className="px-4 pt-3 text-xs uppercase tracking-[0.18em] text-sand-100/45">
          {shown.length > 0
            ? t("photos.inView", { n: shown.length })
            : t("photos.noneInView")}
        </p>
        <div
          ref={stripRef}
          className="flex min-h-[6.5rem] gap-2 overflow-x-auto px-4 pb-4 pt-2"
        >
          {shown.map((p) => {
            const blur = blurhashToDataURL(p.blurhash);
            return (
              <button
                key={p.id}
                data-id={p.id}
                onMouseEnter={() => setSelectedId(p.id)}
                onFocus={() => setSelectedId(p.id)}
                onClick={() => focusPhoto(p.id)}
                title={p.caption ?? p.postTitle}
                className={cn(
                  "relative h-20 w-28 shrink-0 overflow-hidden rounded-lg ring-2 ring-transparent transition",
                  selectedId === p.id
                    ? "ring-ember-400"
                    : "hover:ring-white/40",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={optimizedSrc(p.url, 224, 65)}
                  alt={p.caption ?? ""}
                  loading="lazy"
                  className="size-full bg-cover bg-center object-cover"
                  style={
                    blur ? { backgroundImage: `url(${blur})` } : undefined
                  }
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
