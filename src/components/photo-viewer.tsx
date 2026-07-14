"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { Photo } from "@/lib/types";
import { optimizedSrc } from "@/lib/utils";
import { blurhashToDataURL } from "@/lib/blurhash";
import { useT } from "@/components/i18n";
import { useFocusTrap } from "@/lib/use-focus-trap";

export type ViewerItem = {
  url: string;
  alt?: string;
  caption?: string | null;
  blurhash?: string | null;
  mediaType?: "image" | "video" | null;
  posterUrl?: string | null;
};

/**
 * The single full-screen media viewer for the whole site — article images, the
 * end-of-article gallery, the /photos explorer and the journey map. It shows a
 * collection and pages through it with prev/next buttons, keyboard arrows and a
 * horizontal swipe, and keeps every visual nicety of the old single-image
 * lightbox: an instant blurred backdrop (no black flash), landscape-on-portrait
 * rotation, a progressive hi-res crossfade, focus trap, body-scroll lock, and
 * hardware/Back closing it. Videos in the set render with native controls.
 */
export function PhotoViewer({
  open,
  items,
  index,
  onIndexChange,
  onClose,
}: {
  open: boolean;
  items: ViewerItem[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [mounted, setMounted] = useState(false);
  const [rotated, setRotated] = useState(false);
  const [hiRes, setHiRes] = useState(false);
  const ratioRef = useRef(1); // natural width / height of the current photo
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open && mounted);

  useEffect(() => setMounted(true), []);

  const count = items.length;
  const safeIndex = count > 0 ? Math.max(0, Math.min(index, count - 1)) : 0;
  const item = count > 0 ? items[safeIndex] : null;
  const isVideo = item?.mediaType === "video";

  const next = useCallback(() => {
    if (count > 1) onIndexChange((safeIndex + 1) % count);
  }, [count, safeIndex, onIndexChange]);
  const prev = useCallback(() => {
    if (count > 1) onIndexChange((safeIndex - 1 + count) % count);
  }, [count, safeIndex, onIndexChange]);

  const shouldRotate = () =>
    typeof window !== "undefined" &&
    window.innerHeight > window.innerWidth &&
    ratioRef.current > 1.15;

  // Reset per-item state whenever the shown item changes (new photo re-measures
  // its ratio on load and re-fetches its hi-res tier).
  useEffect(() => {
    if (!open) return;
    setHiRes(false);
    ratioRef.current = 1;
    setRotated(false);
  }, [safeIndex, open]);

  // Open/close side effects — deliberately NOT keyed on the index (navigating
  // must not re-push history or re-lock scroll). onClose is stabilized by the
  // provider, so this runs once per open.
  useEffect(() => {
    if (!open) return;
    const sync = () => setRotated(shouldRotate());
    sync();
    // A history entry so the browser / hardware Back closes the viewer.
    window.history.pushState({ ...window.history.state, lightbox: true }, "");
    const onPop = () => onClose();
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    window.addEventListener("popstate", onPop);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
      window.removeEventListener("popstate", onPop);
      document.body.style.overflow = prevOverflow;
      if (window.history.state?.lightbox) window.history.back();
    };
  }, [open, onClose]);

  // Keyboard nav — cheap to re-bind when next/prev change on navigation.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, next, prev, onClose]);

  // Swipe-to-page. `swiped` suppresses the click that trails the gesture so a
  // swipe doesn't also dismiss the viewer. A touch on the <video> is left to its
  // native controls.
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const onTouchStart = useCallback((e: ReactTouchEvent) => {
    swiped.current = false;
    if ((e.target as HTMLElement).closest("video")) {
      touchStart.current = null;
      return;
    }
    const p = e.touches[0];
    touchStart.current = { x: p.clientX, y: p.clientY };
  }, []);
  const onTouchEnd = useCallback(
    (e: ReactTouchEvent) => {
      const start = touchStart.current;
      touchStart.current = null;
      if (!start || count < 2) return;
      const p = e.changedTouches[0];
      const dx = p.clientX - start.x;
      const dy = p.clientY - start.y;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        swiped.current = true;
        if (dx < 0) next();
        else prev();
      }
    },
    [count, next, prev],
  );
  // Dismiss on a backdrop / photo tap — unless it's the tail of a swipe.
  const onDismiss = useCallback(() => {
    if (swiped.current) {
      swiped.current = false;
      return;
    }
    onClose();
  }, [onClose]);

  if (!mounted) return null;

  const src = item?.url ?? null;
  const sizeCls = rotated ? "h-[95vw] w-[92dvh]" : "h-[96dvh] w-[96vw]";
  const imgCls = `object-contain max-w-none ${rotated ? "rotate-90" : ""} ${sizeCls}`;
  // Instant placeholder (decoded blurhash, else the already-displayed 1600px
  // tier — a cache hit). Skipped for video, which carries its own poster.
  const backdrop = isVideo
    ? null
    : (blurhashToDataURL(item?.blurhash ?? null, 32, 32) ??
      (src ? optimizedSrc(src, 1600, 80) : null));
  const wantHiRes =
    Math.max(window.innerWidth, window.innerHeight) *
      (window.devicePixelRatio || 1) >
    1600;

  return createPortal(
    <AnimatePresence>
      {open && src && (
        <motion.div
          ref={dialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={item?.alt || t("common.close")}
          onClick={onDismiss}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          style={{ WebkitTapHighlightColor: "transparent" }}
          className="fixed inset-0 z-[120] flex items-center justify-center overflow-hidden bg-ink-950/90 p-2 backdrop-blur-sm sm:p-4"
        >
          {backdrop && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={backdrop}
              alt=""
              aria-hidden
              decoding="sync"
              fetchPriority="high"
              className="pointer-events-none absolute inset-0 size-full scale-110 object-cover opacity-70 blur-2xl"
            />
          )}

          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="absolute right-3 top-3 z-10 grid size-10 place-items-center rounded-full bg-white/10 text-sand-50 outline-none transition hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/70 active:bg-white/25 sm:right-5 sm:top-5"
          >
            <X className="size-5" />
          </button>

          {count > 1 && (
            <>
              <button
                type="button"
                aria-label={t("common.previous")}
                onClick={(e) => {
                  e.stopPropagation();
                  prev();
                }}
                className="absolute left-3 z-10 grid size-11 place-items-center rounded-full bg-white/10 text-sand-50 outline-none transition hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/70 active:bg-white/25 sm:left-5"
              >
                <ChevronLeft className="size-6" />
              </button>
              <button
                type="button"
                aria-label={t("common.next")}
                onClick={(e) => {
                  e.stopPropagation();
                  next();
                }}
                className="absolute right-3 z-10 grid size-11 place-items-center rounded-full bg-white/10 text-sand-50 outline-none transition hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/70 active:bg-white/25 sm:right-5"
              >
                <ChevronRight className="size-6" />
              </button>
              <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-ink-950/50 px-3 py-1 text-xs tabular-nums text-sand-100/90 sm:top-5">
                {safeIndex + 1} / {count}
              </div>
            </>
          )}

          <motion.div
            key={safeIndex}
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2, ease: [0.2, 0.7, 0.2, 1] }}
            // Video: swallow the click so the controls work and a tap doesn't
            // close. Image: let the tap bubble to onDismiss (cursor-zoom-out).
            onClick={isVideo ? (e) => e.stopPropagation() : undefined}
            className={`relative ${isVideo ? "" : "cursor-zoom-out"} [filter:drop-shadow(0_24px_45px_rgba(10,9,8,0.55))]`}
          >
            {isVideo ? (
              <video
                src={src}
                poster={item?.posterUrl ?? undefined}
                controls
                playsInline
                autoPlay
                className="max-h-[92dvh] w-auto max-w-[96vw] rounded-2xl"
              />
            ) : (
              <>
                {/* Low-res (usually cached) — sizes the box and shows quickly. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={optimizedSrc(src, 1600, 80)}
                  alt={item?.alt ?? ""}
                  onLoad={(e) => {
                    const el = e.currentTarget;
                    if (el.naturalHeight) {
                      ratioRef.current = el.naturalWidth / el.naturalHeight;
                      setRotated(shouldRotate());
                    }
                  }}
                  className={imgCls}
                />
                {/* High-res — crossfades in once downloaded, on capable screens. */}
                {wantHiRes && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={optimizedSrc(src, 2560, 85)}
                    alt=""
                    aria-hidden
                    onLoad={() => setHiRes(true)}
                    className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${imgCls} ${
                      hiRes ? "opacity-100" : "opacity-0"
                    }`}
                  />
                )}
              </>
            )}
          </motion.div>

          {item?.caption && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-ink-950/85 to-transparent px-4 pb-5 pt-12 sm:px-6 sm:pb-7">
              <p className="mx-auto max-w-3xl text-center text-sm leading-snug text-sand-100/90 sm:text-base">
                {item.caption}
              </p>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ─── Article-level registry ─────────────────────────────────────────────────
// One viewer instance per article, opened by any image (inline or gallery) via
// the photo's id, so the reader pages through ALL of the article's photos as a
// single set.

type PhotoViewerCtx = { open: (photoId: string) => void };
const PhotoViewerContext = createContext<PhotoViewerCtx | null>(null);

/** Null when no provider is mounted (e.g. a generic markdown image, or the story
 *  map) — callers fall back to a single-image view. */
export function usePhotoViewer(): PhotoViewerCtx | null {
  return useContext(PhotoViewerContext);
}

function toItem(p: Photo): ViewerItem {
  return {
    url: p.url ?? "",
    alt: p.caption ?? "",
    caption: p.caption ?? null,
    blurhash: p.blurhash ?? null,
    mediaType: p.media_type ?? "image",
    posterUrl: p.poster_url ?? null,
  };
}

export function PhotoViewerProvider({
  photos,
  children,
}: {
  photos: Photo[];
  children: ReactNode;
}) {
  const [index, setIndex] = useState<number | null>(null);

  // Only photos with a URL are viewable; build the item list and the id→index
  // map from the same filtered order so they stay aligned.
  const { items, indexById } = useMemo(() => {
    const items: ViewerItem[] = [];
    const indexById = new Map<string, number>();
    for (const p of photos) {
      if (!p.url) continue;
      indexById.set(p.id, items.length);
      items.push(toItem(p));
    }
    return { items, indexById };
  }, [photos]);

  const open = useCallback(
    (photoId: string) => {
      const i = indexById.get(photoId);
      if (i != null) setIndex(i);
    },
    [indexById],
  );
  const close = useCallback(() => setIndex(null), []);
  const value = useMemo(() => ({ open }), [open]);

  return (
    <PhotoViewerContext.Provider value={value}>
      {children}
      <PhotoViewer
        open={index !== null}
        items={items}
        index={index ?? 0}
        onIndexChange={setIndex}
        onClose={close}
      />
    </PhotoViewerContext.Provider>
  );
}
