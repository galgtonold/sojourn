import { getGeotaggedPhotos } from "@/lib/content";
import { PhotoExplorer } from "@/components/photo-explorer";
import { T, DocumentTitle } from "@/components/i18n";
import { defaultTitle } from "@/lib/i18n";

export const metadata = {
  title: defaultTitle("meta.map"),
  alternates: { canonical: "/map" },
};
// Static, on-demand revalidation. Ships the geotagged photos (both languages);
// PhotoExplorer localizes captions on the client and fetches the GPX routes
// itself from /api/map/tracks. This is the merged Map + Photos view.
//
// The routes used to be serialized into this page. They are the one thing here
// that grows without bound — every journey ever taken, forever — and inlining
// them meant re-downloading the whole archive's geometry inside the HTML on
// every visit, uncacheable apart from the markup. Fetched separately they are
// cached, shared between visits, and loaded at the level of detail the current
// zoom can actually show. See @/lib/map-lod.
// The hourly floor is the prebuilt-image safety net explained in src/app/page.tsx.
export const revalidate = 3600;

export default async function MapPage() {
  const photos = await getGeotaggedPhotos();

  return (
    <div className="mx-auto max-w-6xl px-6 pb-24 pt-28">
      <DocumentTitle k="meta.map" />
      <h1 className="font-display text-4xl font-semibold sm:text-5xl">
        <T k="map.title" />
      </h1>
      <p className="mt-2 max-w-xl text-sand-100/60">
        <T k="map.subtitle" />
      </p>
      {photos.length > 0 ? (
        <div className="mt-8">
          <PhotoExplorer photos={photos} fetchTracks />
        </div>
      ) : (
        <p className="mt-10 text-sand-100/50">
          <T k="photos.empty" />
        </p>
      )}
    </div>
  );
}
