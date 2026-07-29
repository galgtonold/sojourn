import { notFound } from "next/navigation";
import { prerenderParams } from "@/lib/prerender";
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
  return prerenderParams("trip maps", async () => {
    const trips = await getTrips();
    return trips.map((t) => ({ slug: t.slug }));
  });
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
  // getPublishedPostsByTrip returns newest-first; walk the trip oldest→newest so
  // the map sequence matches the reading order.
  const orderedPosts = [...tripPosts].sort((a, b) =>
    (a.published_at ?? "").localeCompare(b.published_at ?? ""),
  );
  const tracks = orderedPosts.flatMap((p) => p.tracks);

  // Emit stops in the gallery order the author chose: posts oldest→newest, and
  // within each post its photos in their arranged sort_order (p.photos is
  // already sorted). `order` carries that sequence to the client so the journey
  // walk follows it instead of re-deriving order from photo timestamps (which
  // mis-slots a photo whose capture time sits outside its post's day).
  let order = 0;
  const stops: JourneyStop[] = [];
  for (const p of orderedPosts) {
    for (const l of p.locations) {
      stops.push({
        id: l.id,
        type: "waypoint",
        name: l.name,
        lat: l.lat,
        lng: l.lng,
        href: `/posts/${p.slug}`,
        order: order++,
      });
    }
    for (const ph of p.photos) {
      if (ph.lat == null || ph.lng == null || !ph.url) continue;
      stops.push({
        id: ph.id,
        type: "photo",
        name: ph.caption ?? p.title,
        lat: ph.lat,
        lng: ph.lng,
        photoUrl: ph.url,
        blurhash: ph.blurhash,
        caption: ph.caption,
        takenAt: ph.taken_at,
        href: `/posts/${p.slug}`,
        // Raw overlays so the explorer can localize on the client.
        captionI18n: ph.i18n,
        postTitle: p.title,
        postTitleI18n: p.i18n,
        order: order++,
      });
    }
  }

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
