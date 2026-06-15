import { Skeleton } from "@/components/skeleton";

// /photos renders a single rounded card: a full-width map with a thumbnail
// filmstrip footer (see PhotoExplorer). Mirror that, not the home hero.
export default function PhotosLoading() {
  return (
    <div className="mx-auto max-w-6xl px-6 pb-24 pt-28">
      <Skeleton className="h-12 w-64" />
      <Skeleton className="mt-3 h-4 w-full max-w-xl" />
      <Skeleton className="mt-2 h-3.5 w-40" />
      <div className="mt-8 overflow-hidden rounded-3xl ring-1 ring-white/10">
        <div className="skeleton h-[58dvh] min-h-[400px] w-full" />
        <div className="border-t border-white/10 bg-ink-900/80 px-4 pb-4 pt-3">
          <Skeleton className="h-3 w-28 rounded-full" />
          <div className="mt-2 flex min-h-[6.5rem] gap-2 overflow-hidden">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="size-24 shrink-0 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
