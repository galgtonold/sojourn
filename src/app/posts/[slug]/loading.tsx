import { Skeleton } from "@/components/skeleton";

export default function PostLoading() {
  return (
    <article>
      {/* Cover */}
      <div className="relative h-[70dvh] min-h-[460px] w-full overflow-hidden">
        <Skeleton className="absolute inset-0 rounded-none" />
        <div className="relative z-10 mx-auto flex h-full max-w-3xl flex-col justify-end px-6 pb-12">
          <Skeleton className="h-4 w-40 rounded-full" />
          <Skeleton className="mt-5 h-12 w-full" />
          <Skeleton className="mt-3 h-12 w-3/4" />
          <Skeleton className="mt-6 h-4 w-64" />
        </div>
      </div>

      {/* Body — varied widths so it reads like prose. */}
      <div className="mx-auto max-w-3xl space-y-4 px-6 py-14">
        <Skeleton className="h-8 w-1/2" />
        {["w-full", "w-11/12", "w-full", "w-10/12", "w-full", "w-3/4"].map(
          (w, i) => (
            <Skeleton key={i} className={`h-4 ${w}`} />
          ),
        )}
        <Skeleton className="mt-6 aspect-video w-full rounded-2xl" />
        {["w-full", "w-11/12", "w-2/3"].map((w, i) => (
          <Skeleton key={i} className={`h-4 ${w}`} />
        ))}
      </div>
    </article>
  );
}
