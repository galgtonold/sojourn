import { getGeotaggedPhotos } from "@/lib/content";
import { TripMap, type PhotoPin } from "@/components/trip-map";
import { T } from "@/components/i18n";

export const metadata = { title: "Photo map" };
export const revalidate = 60;

export default async function PhotosPage() {
  const photos = await getGeotaggedPhotos();

  const pins: PhotoPin[] = photos.map((p) => ({
    id: p.id,
    lat: p.lat,
    lng: p.lng,
    url: p.url,
    caption: p.caption,
    href: `/posts/${p.postSlug}`,
  }));

  return (
    <div className="mx-auto max-w-6xl px-6 pb-24 pt-28">
      <h1 className="font-display text-4xl font-semibold sm:text-5xl">
        <T k="photos.title" />
      </h1>
      <p className="mt-2 max-w-xl text-sand-100/60">
        <T k="photos.subtitle" />
      </p>
      {pins.length > 0 ? (
        <>
          <p className="mt-1 text-sm text-sand-100/40">
            <T k="photos.count" vars={{ n: pins.length }} />
          </p>
          <div className="mt-8">
            <TripMap
              photos={pins}
              clusterPhotos
              route={false}
              className="h-[72dvh] min-h-[480px]"
            />
          </div>
        </>
      ) : (
        <p className="mt-10 text-sand-100/50">
          <T k="photos.empty" />
        </p>
      )}
    </div>
  );
}
