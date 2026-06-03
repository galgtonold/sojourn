import { cn } from "@/lib/utils";

/** A shimmering placeholder block. Compose these to mirror a route's layout. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("skeleton rounded-lg", className)}
    />
  );
}

/** Card placeholder matching <PostCard>'s 4:5 frame with a few text lines. */
export function PostCardSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-ink-800">
      <div className="skeleton aspect-[4/5] w-full" />
      <div className="absolute inset-x-0 bottom-0 space-y-2.5 p-5">
        <Skeleton className="h-3 w-24 rounded-full" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-2/3" />
      </div>
    </div>
  );
}

/** A responsive grid of card skeletons. */
export function PostGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <PostCardSkeleton key={i} />
      ))}
    </div>
  );
}
