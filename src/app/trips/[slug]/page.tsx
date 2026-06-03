import { notFound } from "next/navigation";
import { getPublishedPosts, getTrips } from "@/lib/content";
import { formatDate } from "@/lib/utils";
import { PostCard } from "@/components/post-card";
import { TripMap, type MapMarker } from "@/components/trip-map";

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

      {markers.length > 0 && (
        <div className="mt-8">
          <TripMap markers={markers} className="h-[460px]" />
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
