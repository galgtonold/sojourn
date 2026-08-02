"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  type PanInfo,
} from "framer-motion";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { Photo } from "@/lib/types";
import { optimizedSrc } from "@/lib/utils";
import { blurhashToDataURL } from "@/lib/blurhash";
import { swipeTarget, wasDragged } from "@/lib/swipe";
import { PhotoSlide, type ViewerItem } from "@/components/photo-slide";
import { useT } from "@/components/i18n";
import { useFocusTrap } from "@/lib/use-focus-trap";

export type { ViewerItem };

// The track has to be re-centred in the same commit that swaps in the new
// current photo, so this must run before paint. Guarded because the viewer is
// rendered (and returns null) on the server, where useLayoutEffect warns.
const useIsoLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * The single full-screen media viewer for the whole site — article images, the
 * end-of-article gallery, the /photos explorer and the journey map. It shows a
 * collection and pages through it with prev/next buttons, keyboard arrows and a
 * drag, and keeps every visual nicety of the old single-image lightbox: an
 * instant blurred backdrop (no black flash), landscape-on-portrait rotation, a
 * progressive hi-res crossfade, focus trap, body-scroll lock, and
 * hardware/Back closing it. Videos in the set render with native controls.
 *
 * Three photos are mounted at a time — previous, current, next — on a track that
 * follows the pointer. That is one mechanism serving three ends: the drag has
 * something to show (you watch one photo leave and the next arrive rather than
 * waiting for a jump on release), the neighbours are fetched and decoded while
 * you look at the current one, so paging is instant, and because it rides on
 * pointer events a mouse drag on the desktop behaves exactly like a thumb.
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
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open && mounted);

  useEffect(() => setMounted(true), []);

  const count = items.length;
  const safeIndex = count > 0 ? Math.max(0, Math.min(index, count - 1)) : 0;
  const item = count > 0 ? items[safeIndex] : null;
  const isVideo = item?.mediaType === "video";

  // Viewport facts the slides need. Seeded from the real window on first render
  // (not in an effect) so the first paint is already correct and a drag started
  // immediately isn't measured against a zero width.
  const [view, setView] = useState(() => ({
    width: typeof window === "undefined" ? 0 : window.innerWidth,
    portrait:
      typeof window !== "undefined" && window.innerHeight > window.innerWidth,
  }));

  // Aspect ratios, remembered per URL. A neighbour is measured while it is still
  // off-screen, so it slides in already rotated correctly instead of snapping
  // once its onLoad lands.
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const onRatio = useCallback((url: string, ratio: number) => {
    setRatios((r) => (r[url] === ratio ? r : { ...r, [url]: ratio }));
  }, []);

  // ── The track ─────────────────────────────────────────────────────────────
  const x = useMotionValue(0);
  // A commit is in flight: ignore further navigation until the index lands, or
  // a fast double-tap on the arrows would leave the track mid-slide.
  const busy = useRef(false);
  // The pointer travelled far enough to be a drag, so swallow the click that
  // trails it — otherwise paging would also dismiss the viewer.
  const dragged = useRef(false);

  // Re-centre the moment the index changes. The cells re-render around the new
  // current photo, so zeroing the offset has to happen in the SAME commit or the
  // previous photo flashes back for a frame.
  useIsoLayoutEffect(() => {
    x.set(0);
    busy.current = false;
  }, [safeIndex, open, x]);

  const go = useCallback(
    (dir: 1 | -1) => {
      if (count < 2 || busy.current) return;
      busy.current = true;
      const span = view.width || window.innerWidth;
      // The controls are themselves thenable — the index lands only once the
      // outgoing photo has finished sliding, so the swap is never visible.
      void animate(x, -dir * span, {
        duration: 0.26,
        ease: [0.2, 0.7, 0.2, 1],
      }).then(() => {
        onIndexChange((safeIndex + dir + count) % count);
      });
    },
    [count, safeIndex, onIndexChange, view.width, x],
  );
  const next = useCallback(() => go(1), [go]);
  const prev = useCallback(() => go(-1), [go]);

  const onDragEnd = useCallback(
    (_: unknown, info: PanInfo) => {
      dragged.current = wasDragged(info.offset.x);
      const dir = swipeTarget({
        dx: info.offset.x,
        velocity: info.velocity.x,
        width: view.width,
      });
      if (dir !== 0) go(dir);
      // Not far enough: spring back rather than snap, so a hesitant drag reads
      // as "not yet" instead of as a glitch.
      else void animate(x, 0, { type: "spring", stiffness: 420, damping: 42 });
    },
    [go, view.width, x],
  );

  // Open/close side effects — deliberately NOT keyed on the index (navigating
  // must not re-push history or re-lock scroll). onClose is stabilized by the
  // provider, so this runs once per open.
  useEffect(() => {
    if (!open) return;
    const sync = () =>
      setView({
        width: window.innerWidth,
        portrait: window.innerHeight > window.innerWidth,
      });
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

  // Dismiss on a backdrop / photo tap — unless it's the tail of a drag.
  const onDismiss = useCallback(() => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    onClose();
  }, [onClose]);

  if (!mounted) return null;

  const src = item?.url ?? null;
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
  // A video owns its pointer for the native controls, so the track can't take
  // the drag while one is centred; the arrows and the keyboard still page.
  const canDrag = count > 1 && !isVideo;
  const offsets = count > 1 ? [-1, 0, 1] : [0];

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

          <motion.div
            style={{ x }}
            drag={canDrag ? "x" : false}
            dragDirectionLock
            dragMomentum={false}
            dragElastic={0.14}
            dragConstraints={{ left: -view.width, right: view.width }}
            onDragStart={() => {
              dragged.current = true;
            }}
            onDragEnd={onDragEnd}
            className={`absolute inset-0 select-none ${
              canDrag ? "cursor-grab active:cursor-grabbing" : ""
            }`}
          >
            {offsets.map((off) => {
              const i = (safeIndex + off + count) % count;
              const slide = items[i];
              return (
                <div
                  key={off}
                  style={{ left: `${off * 100}%` }}
                  // Video: swallow the click so the controls work and a tap
                  // doesn't close. Image: let it bubble to onDismiss.
                  onClick={
                    slide?.mediaType === "video"
                      ? (e) => e.stopPropagation()
                      : undefined
                  }
                  className={`absolute inset-y-0 flex w-full items-center justify-center ${
                    canDrag || slide?.mediaType === "video"
                      ? ""
                      : "cursor-zoom-out"
                  }`}
                >
                  {slide && (
                    <PhotoSlide
                      item={slide}
                      active={off === 0}
                      portrait={view.portrait}
                      wantHiRes={wantHiRes}
                      ratio={ratios[slide.url] ?? 0}
                      onRatio={onRatio}
                    />
                  )}
                </div>
              );
            })}
          </motion.div>

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
