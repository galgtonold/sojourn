import { Skeleton, PostGridSkeleton } from "@/components/skeleton";

export default function PostsLoading() {
  return (
    <div className="mx-auto max-w-6xl px-6 pb-24 pt-28">
      <Skeleton className="h-12 w-72" />
      <Skeleton className="mt-3 h-4 w-48" />
      <div className="mt-10">
        <PostGridSkeleton count={9} />
      </div>
    </div>
  );
}
