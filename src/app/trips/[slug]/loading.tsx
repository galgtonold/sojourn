import { Skeleton, PostGridSkeleton } from "@/components/skeleton";

export default function TripLoading() {
  return (
    <div className="mx-auto max-w-6xl px-6 pb-24 pt-28">
      <Skeleton className="h-4 w-24 rounded-full" />
      <Skeleton className="mt-3 h-12 w-2/3" />
      <Skeleton className="mt-4 h-5 w-full max-w-2xl" />
      <Skeleton className="mt-3 h-4 w-56" />
      {/* "Explore the journey" card */}
      <Skeleton className="mt-8 h-32 w-full rounded-3xl" />
      <div className="mt-10">
        <PostGridSkeleton count={6} />
      </div>
    </div>
  );
}
