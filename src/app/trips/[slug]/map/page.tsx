import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Camera, Route } from "lucide-react";
import { getPublishedPosts, getTrips } from "@/lib/content";
import { TripMap, type MapMarker, type PhotoPin } from "@/components/trip-map";
import { formatDistance } from "@/lib/gpx";

export const revalidate = 60;
export const metadata = { title: "Journey map" };

export default async function TripMapPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [trips, posts] = await Promise.all([getTrips(), getPublishedPosts()]);
  const trip = trips.find((t) => t.slug === slug);
  if (!trip) notFound();

  const tripPosts = posts.filter((p) => p.trip_id === trip.id);
  const tracks = tripPosts.flatMap((p) => p.tracks);
  const markers: MapMarker[] = tripPosts.flatMap((p) =>
    p.locations.map((l) => ({
      id: l.id,
      name: l.name,
      lat: l.lat,
      lng: l.lng,
      href: `/posts/${p.slug}`,
    })),
  );
  const photos: PhotoPin[] = tripPosts.flatMap((p) =>
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
  const totalDistance = tracks.reduce((s, t) => s + (t.distance_m ?? 0), 0);

  return (
    <div className="relative h-dvh w-full">
      <TripMap
        markers={markers}
        tracks={tracks}
        photos={photos}
        route={false}
        className="h-dvh"
      />

      {/* Overlay info card */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-4 sm:bottom-6 sm:left-6 sm:right-auto">
        <div className="glass pointer-events-auto max-w-sm rounded-2xl p-5">
          <Link
            href={`/trips/${trip.slug}`}
            className="mb-3 inline-flex items-center gap-1.5 text-sm text-sand-100/70 hover:text-ember-400"
          >
            <ArrowLeft className="size-4" /> Back to {trip.title}
          </Link>
          <h1 className="font-display text-2xl font-semibold">
            {trip.title} — the journey
          </h1>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-sand-100/70">
            {totalDistance > 0 && (
              <span className="flex items-center gap-1.5">
                <Route className="size-4 text-ember-400" />
                {formatDistance(totalDistance)}
              </span>
            )}
            {photos.length > 0 && (
              <span className="flex items-center gap-1.5">
                <Camera className="size-4 text-ember-400" />
                {photos.length} located photos
              </span>
            )}
            <span>{tripPosts.length} entries</span>
          </div>
        </div>
      </div>
    </div>
  );
}
