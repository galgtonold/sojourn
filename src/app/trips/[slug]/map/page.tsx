import { notFound } from "next/navigation";
import { getPublishedPostsByTrip, getTrips } from "@/lib/content";
import { getReaderLocale } from "@/lib/i18n-server";
import { localizePostDeep, localizeTrip } from "@/lib/i18n-content";
import {
  JourneyExplorer,
  type JourneyStop,
} from "@/components/journey-explorer";
import { DocumentTitle } from "@/components/i18n";
import { defaultTitle } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata = { title: defaultTitle("meta.journeyMap") };

export default async function TripMapPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const locale = await getReaderLocale();
  const trips = await getTrips();
  const found = trips.find((t) => t.slug === slug);
  if (!found) notFound();
  const trip = localizeTrip(found, locale);

  const tripPosts = (await getPublishedPostsByTrip(trip.id)).map((p) =>
    localizePostDeep(p, locale),
  );
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
        stops={stops}
        tracks={tracks}
      />
    </>
  );
}
