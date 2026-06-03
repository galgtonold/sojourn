import { Skeleton } from "@/components/skeleton";

export default function MapLoading() {
  return (
    <div className="mx-auto max-w-6xl px-6 pb-24 pt-28">
      <Skeleton className="h-12 w-72" />
      <Skeleton className="mt-3 h-4 w-full max-w-xl" />
      <Skeleton className="mt-8 h-[70vh] min-h-96 w-full rounded-3xl" />
    </div>
  );
}
