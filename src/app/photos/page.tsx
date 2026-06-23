import { getGeotaggedPhotos } from "@/lib/content";
import { PhotoExplorer } from "@/components/photo-explorer";
import { T } from "@/components/i18n";
import { defaultTitle } from "@/lib/i18n";

export const metadata = {
  title: defaultTitle("photos.title"),
  alternates: { canonical: "/photos" },
};
// Static, on-demand revalidation: ship the raw photos (both languages) and let
// PhotoExplorer localize caption + post title on the client.
export const revalidate = false;

export default async function PhotosPage() {
  const photos = await getGeotaggedPhotos();

  return (
    <div className="mx-auto max-w-6xl px-6 pb-24 pt-28">
      <h1 className="font-display text-4xl font-semibold sm:text-5xl">
        <T k="photos.title" />
      </h1>
      <p className="mt-2 max-w-xl text-sand-100/60">
        <T k="photos.subtitle" />
      </p>
      {photos.length > 0 ? (
        <>
          <p className="mt-1 text-sm text-sand-100/60">
            <T k="photos.count" vars={{ n: photos.length }} />
          </p>
          <div className="mt-8">
            <PhotoExplorer photos={photos} />
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
