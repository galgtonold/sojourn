"use client";
import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { X, ChevronLeft, ChevronRight, Play } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type { Photo } from "@/lib/types";
import { optimizedSrc } from "@/lib/utils";
import { blurhashToDataURL } from "@/lib/blurhash";
import { useT } from "@/components/i18n";

export function Gallery({ photos }: { photos: Photo[] }) {
  const t = useT();
  const [open, setOpen] = useState<number | null>(null);
  // blurhashToDataURL needs a <canvas>, so it returns null on the server but a
  // data URL on the client — using it during render makes next/image's
  // placeholder differ between SSR and hydration (a hydration mismatch on every
  // photo that has a blurhash). Gate it behind mount so the first client render
  // matches the server (no blur), then upgrade to the blur placeholder. See
  // docs/qa/03-bug-log.md (BUG-003).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const close = useCallback(() => setOpen(null), []);
  const next = useCallback(
    () => setOpen((i) => (i === null ? i : (i + 1) % photos.length)),
    [photos.length],
  );
  const prev = useCallback(
    () =>
      setOpen((i) =>
        i === null ? i : (i - 1 + photos.length) % photos.length,
      ),
    [photos.length],
  );

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, close, next, prev]);

  if (photos.length === 0) return null;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((photo, i) => {
          const blur = mounted ? blurhashToDataURL(photo.blurhash) : null;
          return (
            <button
              key={photo.id}
              id={`photo-${photo.id}`}
              onClick={() => setOpen(i)}
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

      <AnimatePresence>
        {open !== null && (
          <motion.div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-950/95 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
          >
            <button
              onClick={close}
              aria-label={t("common.close")}
              className="absolute right-4 top-4 grid size-10 place-items-center rounded-full bg-white/10 hover:bg-white/20"
            >
              <X className="size-5" />
            </button>
            {photos.length > 1 && (
              <>
                <button
                  aria-label={t("common.previous")}
                  onClick={(e) => {
                    e.stopPropagation();
                    prev();
                  }}
                  className="absolute left-3 grid size-11 place-items-center rounded-full bg-white/10 hover:bg-white/20"
                >
                  <ChevronLeft className="size-6" />
                </button>
                <button
                  aria-label={t("common.next")}
                  onClick={(e) => {
                    e.stopPropagation();
                    next();
                  }}
                  className="absolute right-3 grid size-11 place-items-center rounded-full bg-white/10 hover:bg-white/20"
                >
                  <ChevronRight className="size-6" />
                </button>
              </>
            )}

            <motion.figure
              key={photos[open].id}
              className="relative mx-auto max-h-[85dvh] w-[92vw] max-w-4xl"
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              onClick={(e) => e.stopPropagation()}
            >
              {photos[open].media_type === "video"
                ? photos[open].url && (
                    <video
                      src={photos[open].url!}
                      poster={photos[open].poster_url ?? undefined}
                      controls
                      playsInline
                      autoPlay
                      className="mx-auto max-h-[80dvh] w-auto rounded-2xl"
                    />
                  )
                : photos[open].url && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={optimizedSrc(photos[open].url!, 2048, 80)}
                      alt={photos[open].caption ?? ""}
                      className="mx-auto max-h-[80dvh] w-auto rounded-2xl object-contain"
                    />
                  )}
              {photos[open].caption && (
                <figcaption className="mt-3 text-center text-sm text-sand-100/70">
                  {photos[open].caption}
                </figcaption>
              )}
            </motion.figure>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
