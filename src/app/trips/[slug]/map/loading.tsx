import { Loader2 } from "lucide-react";

// The journey map fills the viewport, so the parent trips/[slug] loading state
// (a grid of post-card shimmers) makes no sense here. Show a calm, map-shaped
// placeholder with a spinner instead — no content-skeleton shimmer.
export default function JourneyMapLoading() {
  return (
    <div className="relative h-dvh w-full overflow-hidden bg-ink-900">
      {/* Back-link placeholder (matches the explorer's top-left control). */}
      <div className="absolute left-4 top-4 h-9 w-32 rounded-full bg-white/5" />
      {/* Centred spinner — reads clearly as "the map is loading". */}
      <div className="absolute inset-0 grid place-items-center">
        <Loader2 className="size-8 animate-spin text-ember-400/80" />
      </div>
      {/* Stepper-card placeholder — a calm solid block, not a shimmer. */}
      <div className="absolute inset-x-0 bottom-0 p-4 sm:bottom-6 sm:left-1/2 sm:right-auto sm:-translate-x-1/2">
        <div className="mx-auto h-[88px] w-full rounded-2xl border border-white/10 bg-ink-900/80 sm:w-96" />
      </div>
    </div>
  );
}
