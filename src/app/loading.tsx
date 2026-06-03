import { Skeleton, PostGridSkeleton } from "@/components/skeleton";

export default function HomeLoading() {
  return (
    <div>
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pt-32">
        <Skeleton className="h-4 w-56 rounded-full" />
        <Skeleton className="mt-5 h-14 w-full max-w-3xl" />
        <Skeleton className="mt-3 h-14 w-2/3 max-w-xl" />
        <Skeleton className="mt-8 h-[58vh] min-h-80 w-full rounded-3xl" />
      </section>

      {/* Latest entries */}
      <section className="mx-auto max-w-6xl px-6 pt-20">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="mt-3 h-4 w-80" />
        <div className="mt-10">
          <PostGridSkeleton count={6} />
        </div>
      </section>
    </div>
  );
}
