import { Skeleton } from "@/components/skeleton";

export default function TripsLoading() {
  return (
    <div className="mx-auto max-w-6xl px-6 pb-24 pt-28">
      <Skeleton className="h-12 w-64" />
      <Skeleton className="mt-3 h-4 w-full max-w-xl" />
      {/* Two-column grid of 16:10 trip cards — matches the real /trips grid. */}
      <div className="mt-10 grid gap-6 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[16/10] w-full rounded-3xl" />
        ))}
      </div>
    </div>
  );
}
