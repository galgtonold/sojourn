"use client";
import { useEffect, useState } from "react";
import { optimizedSrc } from "@/lib/utils";

export type ViewerItem = {
  url: string;
  alt?: string;
  caption?: string | null;
  blurhash?: string | null;
  mediaType?: "image" | "video" | null;
  posterUrl?: string | null;
};

/** A landscape photo on a portrait screen is turned 90° so it fills the display
 *  instead of sitting in two fat letterbox bars. Below this ratio the gain isn't
 *  worth asking the reader to tilt their phone. */
const ROTATE_ABOVE_RATIO = 1.15;

/**
 * One photo in the viewer's track, with its caption.
 *
 * Rotation is decided per photo rather than once for the viewer: three photos
 * are mounted at a time and they don't share an aspect ratio, so a neighbour has
 * to arrive already turned the right way — the reader sees it before it is
 * centred. The measured ratio is reported UP to the viewer, which remembers it
 * per URL: by the time a neighbour slides in it was measured while off-screen,
 * so it is rotated on its very first frame instead of visibly snapping.
 *
 * The caption lives INSIDE the rotated wrapper on purpose. Rotating the photo
 * while leaving its caption upright leaves the two reading at right angles to
 * each other; rotating them together keeps the caption on the photo's bottom
 * edge in both orientations, and carries it along as the slide is dragged.
 */
export function PhotoSlide({
  item,
  active,
  portrait,
  wantHiRes,
  ratio,
  onRatio,
}: {
  item: ViewerItem;
  /** The centred slide. Only it pays for the hi-res tier and video autoplay. */
  active: boolean;
  portrait: boolean;
  wantHiRes: boolean;
  /** Natural width/height if this photo has ever been measured, else 0. */
  ratio: number;
  onRatio: (url: string, ratio: number) => void;
}) {
  const [hiRes, setHiRes] = useState(false);
  const isVideo = item.mediaType === "video";

  // A slot showing a different photo must re-run its hi-res crossfade from
  // transparent, or the new photo inherits the old one's finished fade.
  useEffect(() => setHiRes(false), [item.url]);

  const rotated = portrait && ratio > ROTATE_ABOVE_RATIO;
  // The box the photo is fitted into. Rotated, it's the viewport with its axes
  // swapped — width measured in vh and height in vw.
  const boxCls = rotated ? "h-[95vw] w-[92dvh]" : "h-[96dvh] w-[96vw]";

  if (isVideo) {
    return (
      <video
        src={item.url}
        poster={item.posterUrl ?? undefined}
        controls
        playsInline
        autoPlay={active}
        className="max-h-[92dvh] w-auto max-w-[96vw] rounded-2xl"
      />
    );
  }

  return (
    <div
      className={`relative ${boxCls} ${rotated ? "rotate-90" : ""} [filter:drop-shadow(0_24px_45px_rgba(10,9,8,0.55))]`}
    >
      {/* Low-res (usually a cache hit from the page behind) — shows quickly. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={optimizedSrc(item.url, 1600, 80)}
        alt={item.alt ?? ""}
        draggable={false}
        onLoad={(e) => {
          const el = e.currentTarget;
          if (el.naturalHeight)
            onRatio(item.url, el.naturalWidth / el.naturalHeight);
        }}
        className="size-full select-none object-contain"
      />
      {/* High-res — crossfades in once downloaded, on capable screens. Only for
          the centred slide: neighbours exist to be ready, not to be studied, and
          tripling the hi-res traffic to prefetch them would defeat the point. */}
      {active && wantHiRes && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={optimizedSrc(item.url, 2560, 85)}
          alt=""
          aria-hidden
          draggable={false}
          onLoad={() => setHiRes(true)}
          className={`pointer-events-none absolute inset-0 size-full select-none object-contain transition-opacity duration-500 ${
            hiRes ? "opacity-100" : "opacity-0"
          }`}
        />
      )}

      {item.caption && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-3 pb-3 sm:px-5 sm:pb-5">
          {/* A panel sized to the text, not a full-width gradient: once the photo
              is rotated the caption sits over the middle of the frame, where a
              scrim anchored to the screen's bottom edge does nothing. */}
          <p className="max-w-3xl rounded-xl bg-ink-950/65 px-3 py-2 text-center text-sm leading-snug text-sand-50 shadow-lg backdrop-blur-md sm:text-base">
            {item.caption}
          </p>
        </div>
      )}
    </div>
  );
}
