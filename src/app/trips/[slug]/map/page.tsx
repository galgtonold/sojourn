import { notFound } from "next/navigation";
import { getPublishedPostsByTrip, getTrips } from "@/lib/content";
import {
  JourneyExplorer,
  type JourneyStop,
} from "@/components/journey-explorer";
import { DocumentTitle } from "@/components/i18n";
import { defaultTitle } from "@/lib/i18n";

// Static, on-demand revalidation: stops + trip title carry both languages;
// JourneyExplorer localizes on the client. Prebuilt per trip slug.
export const revalidate = false;
export const metadata = { title: defaultTitle("meta.journeyMap") };

export async function generateStaticParams() {
  const trips = await getTrips();
  return trips.map((t) => ({ slug: t.slug }));
}

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
        blurhash: ph.blurhash,
        caption: ph.caption,
        takenAt: ph.taken_at,
        href: `/posts/${p.slug}`,
        // Raw overlays so the explorer can localize on the client.
        captionI18n: ph.i18n,
        postTitle: p.title,
        postTitleI18n: p.i18n,
      })),
  );
  const stops = [...waypointStops, ...photoStops];

  if (stops.length === 0) notFound();

  return (
    <>
      <DocumentTitle k="meta.journeyMap" />
      <JourneyExplorer
        title={trip.title}
        backHref={`/trips/${trip.slug}`}
        backLabel={trip.title}
        titleI18n={trip.i18n}
        stops={stops}
        tracks={tracks}
      />
    </>
  );
}
