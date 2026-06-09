import { getPublishedPosts } from "@/lib/content";
import { TripMap, type MapMarker } from "@/components/trip-map";
import { T, DocumentTitle } from "@/components/i18n";
import { defaultTitle } from "@/lib/i18n";

export const metadata = { title: defaultTitle("meta.map") };
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

  return (
    <div className="mx-auto max-w-6xl px-6 pb-24 pt-28">
      <DocumentTitle k="meta.map" />
      <h1 className="font-display text-4xl font-semibold sm:text-5xl">
        <T k="map.title" />
      </h1>
      <p className="mt-2 max-w-xl text-sand-100/60">
        <T k="map.subtitle" />
      </p>
      <div className="mt-8">
        <TripMap
          markers={markers}
          tracks={tracks}
          route={false}
          className="h-[70dvh] min-h-[480px]"
        />
      </div>
    </div>
  );
}
