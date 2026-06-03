import { getPublishedPosts } from "@/lib/content";
import { TripMap, type MapMarker, type PhotoPin } from "@/components/trip-map";

export const metadata = { title: "Map" };
export const revalidate = 60;

export default async function MapPage() {
  const posts = await getPublishedPosts();

  // One marker per post (its primary location), linking back to the entry.
  const markers: MapMarker[] = posts.flatMap((p) => {
    const point = p.locations[0] ?? (p.lat != null && p.lng != null
      ? { id: p.id, name: p.location ?? p.title, lat: p.lat, lng: p.lng }
      : null);
    return point
      ? [{ id: p.id, name: p.title, lat: point.lat, lng: point.lng, href: `/posts/${p.slug}` }]
      : [];
  });

  const tracks = posts.flatMap((p) => p.tracks);
  const photoPins: PhotoPin[] = posts.flatMap((p) =>
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

  return (
    <div className="mx-auto max-w-6xl px-6 pb-24 pt-28">
      <h1 className="font-display text-4xl font-semibold sm:text-5xl">
        The whole map
      </h1>
      <p className="mt-2 max-w-xl text-sand-100/60">
        Every entry, pinned. Tap a marker to jump to the story.
      </p>
      <div className="mt-8">
        <TripMap
          markers={markers}
          tracks={tracks}
          photos={photoPins}
          route={false}
          className="h-[70dvh] min-h-[480px]"
        />
      </div>
    </div>
  );
}
