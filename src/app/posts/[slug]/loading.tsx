import { Skeleton } from "@/components/skeleton";

// Mirrors the common "story" article layout: a full-bleed cover hero with the
// title left-aligned in a narrow reading column, then a two-column body — text
// on the left, a sticky map on the right. (Most posts are geotagged stories;
// simpler centered posts get a slightly-wide skeleton, which is the rarer case.)
export default function PostLoading() {
  return (
    <article>
      {/* Full-bleed cover hero; title sits bottom-left in the reading column. */}
      <header className="relative grain flex min-h-[70dvh] w-full flex-col overflow-hidden">
        <Skeleton className="absolute inset-0 rounded-none" />
        <div className="absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-ink-950 via-ink-950/45 to-transparent" />
        <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-1 flex-col justify-end px-6 pb-12 pt-24 lg:max-w-6xl">
          <div className="w-full lg:max-w-[34rem]">
            <Skeleton className="mb-6 h-4 w-16 rounded-full" />
            <Skeleton className="h-4 w-52 rounded-full" />
            <Skeleton className="mt-3 h-11 w-full" />
            <Skeleton className="mt-2.5 h-11 w-4/5" />
            <Skeleton className="mt-2.5 h-11 w-1/2" />
            <Skeleton className="mt-5 h-4 w-64" />
          </div>
        </div>
      </header>

      {/* Two-column story body: reading column + sticky map. */}
      <div className="mx-auto max-w-6xl px-6">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-10 xl:gap-14">
          {/* Reading column */}
          <div className="mx-auto max-w-2xl py-8 lg:mx-0 lg:max-w-none lg:py-14">
            {/* Lead / excerpt */}
            <Skeleton className="h-6 w-full" />
            <Skeleton className="mt-2.5 h-6 w-11/12" />
            {/* First section */}
            <Skeleton className="mt-8 h-8 w-1/2" />
            <div className="mt-4 space-y-2.5">
              {["w-full", "w-11/12", "w-full", "w-10/12", "w-full", "w-3/4"].map(
                (w, i) => (
                  <Skeleton key={i} className={`h-4 ${w}`} />
                ),
              )}
            </div>
            {/* Inline photo */}
            <Skeleton className="mt-6 aspect-video w-full rounded-2xl" />
            <div className="mt-4 space-y-2.5">
              {["w-full", "w-11/12", "w-2/3"].map((w, i) => (
                <Skeleton key={i} className={`h-4 ${w}`} />
              ))}
            </div>
          </div>
          {/* Sticky map (desktop only) */}
          <div className="hidden lg:block">
            <div className="sticky top-24 h-[calc(100vh-7rem)]">
              <Skeleton className="size-full rounded-3xl" />
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
