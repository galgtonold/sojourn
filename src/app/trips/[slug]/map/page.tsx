import { notFound } from "next/navigation";
import { getPublishedPostsByTrip, getTrips } from "@/lib/content";
import {
  JourneyExplorer,
  type JourneyStop,
} from "@/components/journey-explorer";

export const revalidate = 60;
export const metadata = { title: "Journey map" };

export default async function TripMapPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const trips = await getTrips();
  const trip = trips.find((t) => t.slug === slug);
  if (!trip) notFound();

  const tripPosts = await getPublishedPostsByTrip(trip.id);
  const tracks = tripPosts.flatMap((p) => p.tracks);

  const waypointStops: JourneyStop[] = tripPosts.flatMap((p) =>
    p.locations.map((l) => ({
      id: l.id,
      type: "waypoint" as const,
      name: l.name,
      lat: l.lat,
      lng: l.lng,
      href: `/posts/${p.slug}`,
    })),
  );
  const photoStops: JourneyStop[] = tripPosts.flatMap((p) =>
    p.photos
      .filter((ph) => ph.lat != null && ph.lng != null && ph.url)
      .map((ph) => ({
        id: ph.id,
        type: "photo" as const,
        name: ph.caption ?? p.title,
        lat: ph.lat as number,
        lng: ph.lng as number,
        photoUrl: ph.url,
        caption: ph.caption,
        href: `/posts/${p.slug}`,
      })),
  );
  const stops = [...waypointStops, ...photoStops];

  if (stops.length === 0) notFound();

  return (
    <JourneyExplorer
      title={trip.title}
      backHref={`/trips/${trip.slug}`}
      backLabel={trip.title}
      stops={stops}
      tracks={tracks}
    />
  );
}
