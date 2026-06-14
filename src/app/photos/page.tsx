import { getGeotaggedPhotos } from "@/lib/content";
import { getReaderLocale } from "@/lib/i18n-server";
import { PhotoExplorer } from "@/components/photo-explorer";
import { T } from "@/components/i18n";

export const metadata = { title: "Photo map" };
export const dynamic = "force-dynamic";

export default async function PhotosPage() {
  const locale = await getReaderLocale();
  // Overlay the active locale and drop the raw i18n payloads so only the chosen
  // language ships to the client map (no other-language text in the bundle).
  const photos = (await getGeotaggedPhotos()).map(({ i18n, postI18n, ...g }) => ({
    ...g,
    caption: i18n?.[locale]?.caption ?? g.caption,
    postTitle: postI18n?.[locale]?.title ?? g.postTitle,
  }));

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
          <p className="mt-1 text-sm text-sand-100/40">
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
