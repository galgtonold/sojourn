import { Skeleton, PostGridSkeleton } from "@/components/skeleton";

export default function HomeLoading() {
  return (
    <div>
      {/* Full-bleed hero — the cover fills the viewport with the title, kicker
          and CTA sitting at the bottom (mirrors the real home hero). */}
      <section className="relative h-dvh min-h-[640px] w-full overflow-hidden">
        <Skeleton className="absolute inset-0 rounded-none" />
        <div className="absolute inset-0 bg-gradient-to-b from-ink-950/40 via-ink-950/30 to-ink-950" />
        <div className="relative z-10 mx-auto flex h-full max-w-6xl flex-col justify-end px-6 pb-20">
          <Skeleton className="h-4 w-72 rounded-full" />
          <Skeleton className="mt-4 h-16 w-full max-w-2xl" />
          <Skeleton className="mt-3 h-16 w-2/3 max-w-lg" />
          <Skeleton className="mt-8 h-12 w-56 rounded-full" />
        </div>
      </section>

      {/* Latest entries */}
      <section className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="mt-3 h-4 w-80" />
        <div className="mt-10">
          <PostGridSkeleton count={6} />
        </div>
      </section>
    </div>
  );
}
