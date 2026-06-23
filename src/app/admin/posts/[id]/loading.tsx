import { Skeleton } from "@/components/skeleton";

// Editor-shaped shimmer (heading, the SETUP panel row, the article body and a
// save bar) — closer than the generic dashboard skeleton it would inherit.
export default function EditPostLoading() {
  return (
    <div className="mx-auto max-w-3xl px-6 pb-24 pt-28">
      <Skeleton className="h-9 w-40" />
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-2xl" />
        ))}
      </div>
      <Skeleton className="mt-8 h-12 w-full rounded-2xl" />
      <Skeleton className="mt-3 h-[420px] w-full rounded-2xl" />
      <div className="mt-6 flex gap-2">
        <Skeleton className="h-10 w-28 rounded-full" />
        <Skeleton className="h-10 w-28 rounded-full" />
      </div>
    </div>
  );
}
