import { getGeotaggedPhotos, getMapPosts } from "@/lib/content";
import { PhotoExplorer } from "@/components/photo-explorer";
import { T, DocumentTitle } from "@/components/i18n";
import { defaultTitle } from "@/lib/i18n";

export const metadata = {
  title: defaultTitle("meta.map"),
  alternates: { canonical: "/map" },
};
// Static, on-demand revalidation. Ships the geotagged photos (both languages)
// and the GPX routes; PhotoExplorer localizes captions on the client and draws
// the routes underneath the photo pins. This is the merged Map + Photos view.
export const revalidate = false;

export default async function MapPage() {
  const [photos, posts] = await Promise.all([
    getGeotaggedPhotos(),
    getMapPosts(),
  ]);
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
      {photos.length > 0 ? (
        <div className="mt-8">
          <PhotoExplorer photos={photos} tracks={tracks} />
        </div>
      ) : (
        <p className="mt-10 text-sand-100/50">
          <T k="photos.empty" />
        </p>
      )}
    </div>
  );
}
