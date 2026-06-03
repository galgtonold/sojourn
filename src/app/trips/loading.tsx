import { Skeleton } from "@/components/skeleton";

export default function TripsLoading() {
  return (
    <div className="mx-auto max-w-6xl px-6 pb-24 pt-28">
      <Skeleton className="h-12 w-64" />
      <Skeleton className="mt-3 h-4 w-full max-w-xl" />
      <div className="mt-10 space-y-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-64 w-full rounded-3xl" />
        ))}
      </div>
    </div>
  );
}
