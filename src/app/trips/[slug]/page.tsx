import Link from "next/link";
import { notFound } from "next/navigation";
import { Maximize2 } from "lucide-react";
import { getPublishedPosts, getTrips } from "@/lib/content";
import { formatDate } from "@/lib/utils";
import { PostCard } from "@/components/post-card";
import { TripMap, type MapMarker, type PhotoPin } from "@/components/trip-map";

export const revalidate = 60;

export async function generateStaticParams() {
  const trips = await getTrips();
  return trips.map((t) => ({ slug: t.slug }));
}

export default async function TripPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [trips, posts] = await Promise.all([getTrips(), getPublishedPosts()]);
  const trip = trips.find((t) => t.slug === slug);
  if (!trip) notFound();

  const tripPosts = posts.filter((p) => p.trip_id === trip.id);
  const markers: MapMarker[] = tripPosts.flatMap((p) =>
    p.locations.map((l) => ({
      id: l.id,
      name: l.name,
      lat: l.lat,
      lng: l.lng,
      href: `/posts/${p.slug}`,
    })),
  );
  const tracks = tripPosts.flatMap((p) => p.tracks);
  const photoPins: PhotoPin[] = tripPosts.flatMap((p) =>
    p.photos
      .filter((ph) => ph.lat != null && ph.lng != null && ph.url)
      .map((ph) => ({
        id: ph.id,
        lat: ph.lat as number,
        lng: ph.lng as number,
        url: ph.url as string,
        caption: ph.caption,
        href: `/posts/${p.slug}`,
      })),
  );
  const hasMap = markers.length > 0 || tracks.length > 0 || photoPins.length > 0;

  return (
    <div className="mx-auto max-w-6xl px-6 pb-24 pt-28">
      <p className="text-sm uppercase tracking-[0.25em] text-ember-300">Trip</p>
      <h1 className="mt-2 font-display text-4xl font-semibold sm:text-6xl">
        {trip.title}
      </h1>
      {trip.summary && (
        <p className="mt-3 max-w-2xl text-lg text-sand-100/70">{trip.summary}</p>
      )}
      <p className="mt-2 text-sm text-sand-100/50">
        {trip.start_date && formatDate(trip.start_date)}
        {trip.end_date && ` – ${formatDate(trip.end_date)}`} · {tripPosts.length}{" "}
        entries
      </p>

      {hasMap && (
        <div className="mt-8">
          <div className="mb-3 flex justify-end">
            <Link
              href={`/trips/${trip.slug}/map`}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm transition hover:border-ember-400 hover:text-ember-400"
            >
              <Maximize2 className="size-4" /> Explore the journey map
            </Link>
          </div>
          <TripMap
            markers={markers}
            tracks={tracks}
            photos={photoPins}
            route={false}
            className="h-[460px]"
          />
        </div>
      )}

      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {tripPosts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
    </div>
  );
}
