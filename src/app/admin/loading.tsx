import { Skeleton } from "@/components/skeleton";

// Generic admin shimmer (the dashboard shape: heading, quick actions, a card
// grid and a list). Far closer than the public home hero that the admin pages
// inherited before — they have no loading.tsx of their own.
export default function AdminLoading() {
  return (
    <div className="mx-auto max-w-5xl px-6 pb-24 pt-28">
      <Skeleton className="h-10 w-56" />
      <Skeleton className="mt-2 h-4 w-64" />
      <div className="mt-8 flex flex-wrap gap-3">
        <Skeleton className="h-10 w-36 rounded-full" />
        <Skeleton className="h-10 w-36 rounded-full" />
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-2xl" />
        ))}
      </div>
      <Skeleton className="mt-10 h-7 w-40" />
      <div className="mt-4 space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
