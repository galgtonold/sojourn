import { Skeleton } from "@/components/skeleton";

// Trip-editor-shaped shimmer (heading + a stack of form fields + save bar).
export default function EditTripLoading() {
  return (
    <div className="mx-auto max-w-2xl px-6 pb-24 pt-28">
      <Skeleton className="h-9 w-40" />
      <div className="mt-8 space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-2xl" />
        ))}
      </div>
      <Skeleton className="mt-6 h-10 w-28 rounded-full" />
    </div>
  );
}
