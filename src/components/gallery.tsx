"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { Play } from "lucide-react";
import type { Photo } from "@/lib/types";
import { blurhashToDataURL } from "@/lib/blurhash";
import { useT } from "@/components/i18n";
import { usePhotoViewer } from "@/components/photo-viewer";

/** The end-of-article grid of "extra" photos. Tapping a tile opens the shared
 *  article {@link PhotoViewer} (prev/next buttons, keyboard, swipe) positioned on
 *  that photo, so it pages through every photo in the article. */
export function Gallery({ photos }: { photos: Photo[] }) {
  const t = useT();
  const viewer = usePhotoViewer();
  // blurhashToDataURL needs a <canvas>, so it returns null on the server but a
  // data URL on the client — using it during render makes next/image's
  // placeholder differ between SSR and hydration (a hydration mismatch on every
  // photo that has a blurhash). Gate it behind mount so the first client render
  // matches the server (no blur), then upgrade to the blur placeholder.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (photos.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {photos.map((photo) => {
        const blur = mounted ? blurhashToDataURL(photo.blurhash) : null;
        return (
          <button
            key={photo.id}
            id={`photo-${photo.id}`}
            onClick={() => viewer?.open(photo.id)}
            aria-label={
              photo.media_type === "video" ? t("gallery.playVideo") : undefined
            }
            className="group relative aspect-square scroll-mt-24 overflow-hidden rounded-2xl bg-ink-800"
          >
            {photo.media_type === "video" ? (
              <>
                {photo.poster_url ? (
                  <Image
                    src={photo.poster_url}
                    alt={photo.caption ?? ""}
                    fill
                    sizes="(max-width: 640px) 50vw, 33vw"
                    placeholder={blur ? "blur" : "empty"}
                    blurDataURL={blur ?? undefined}
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="absolute inset-0 bg-ink-800" />
                )}
                <span className="pointer-events-none absolute inset-0 grid place-items-center">
                  <span className="grid size-12 place-items-center rounded-full bg-ink-950/50 ring-1 ring-white/30">
                    <Play className="size-6 translate-x-0.5 text-white" />
                  </span>
                </span>
              </>
            ) : (
              photo.url && (
                <Image
                  src={photo.url}
                  alt={photo.caption ?? ""}
                  fill
                  sizes="(max-width: 640px) 50vw, 33vw"
                  placeholder={blur ? "blur" : "empty"}
                  blurDataURL={blur ?? undefined}
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
              )
            )}
          </button>
        );
      })}
    </div>
  );
}
