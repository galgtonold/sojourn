import Link from "next/link";
import { ArrowLeft, Calendar, Clock, MapPin, Maximize2 } from "lucide-react";
import type { Comment, Interaction, PostWithRelations } from "@/lib/types";
import { cn, formatDate, readingTime } from "@/lib/utils";
import { Gallery } from "@/components/gallery";
import { RichBody } from "@/components/rich-body";
import { StoryMap } from "@/components/story-map";
import { parseBody, referencedPhotoIds } from "@/lib/rich";
import { Reactions } from "@/components/reactions";
import { Comments } from "@/components/comments";
import { TripMap, type MapMarker, type PhotoPin } from "@/components/trip-map";
import { ElevationProfile } from "@/components/elevation-profile";
import { SubscribePrompt } from "@/components/subscribe-prompt";
import { RevealImage } from "@/components/reveal-image";
import { T } from "@/components/i18n";

/** Full article view, shared by the public post page and the admin preview. */
export function PostView({
  post,
  comments,
  interactions = [],
  preview = false,
}: {
  post: PostWithRelations;
  comments: Comment[];
  interactions?: Interaction[];
  preview?: boolean;
}) {
  const usedPhotoIds = referencedPhotoIds(post.body ?? "", post.photos);
  const galleryPhotos = post.photos.filter((p) => !usedPhotoIds.has(p.id));
  const markers: MapMarker[] = post.locations.map((l) => ({
    id: l.id,
    name: l.name,
    lat: l.lat,
    lng: l.lng,
  }));
  const photoPins: PhotoPin[] = post.photos
    .filter((p) => p.lat != null && p.lng != null && p.url)
    .map((p) => ({
      id: p.id,
      lat: p.lat as number,
      lng: p.lng as number,
      url: p.url as string,
      caption: p.caption,
      takenAt: p.taken_at ?? null,
    }));
  const hasMap =
    markers.length > 0 || post.tracks.length > 0 || photoPins.length > 0;

  // Scrollytelling kicks in when the body weaves in ≥2 geotagged photos.
  const blocks = parseBody(post.body ?? "", post.photos, interactions);
  const geoPhotoCount = blocks.filter(
    (b) => b.kind === "photo" && b.photo.lat != null && b.photo.lng != null,
  ).length;
  const useStory = geoPhotoCount >= 2;

  // Story posts read in a left-aligned column beside the sticky map. Align the
  // hero and every footer section to that same reading column (and left edge) so
  // the title, body and footer don't sit at three different margins. Non-story
  // posts stay a single centered column.
  const sectionWrap = useStory
    ? "mx-auto max-w-2xl px-6 lg:max-w-6xl"
    : "mx-auto max-w-3xl px-6";
  const readingCol = useStory ? "lg:max-w-[34rem]" : "";

  return (
    <article>
      {preview && (
        <div className="fixed inset-x-0 top-0 z-[80] bg-ember-600 px-4 py-1.5 text-center text-sm font-medium text-ink-950">
          <T k="preview.draft" />
          {!post.published && (
            <>
              {" — "}
              <T k="preview.notPublished" />
            </>
          )}
          {" · "}
          <Link href={`/admin/posts/${post.id}`} className="underline">
            <T k="preview.backToEditor" />
          </Link>
        </div>
      )}

      <header className="relative grain h-[70dvh] min-h-[460px] w-full overflow-hidden">
        {post.cover_image && (
          <RevealImage
            src={post.cover_image}
            alt={post.cover_alt ?? post.title}
            fill
            priority
            sizes="100vw"
          />
        )}
        {/* Top wash keeps the back-link and location chip legible. */}
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-ink-950/50 to-transparent" />
        {/* Long, smooth dissolve so the cover melts into the page background. */}
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-ink-950 via-ink-950/25 to-transparent" />

        <div
          className={cn(
            "relative z-10 mx-auto flex h-full flex-col justify-end px-6 pb-12",
            useStory ? "max-w-2xl lg:max-w-6xl" : "max-w-3xl",
          )}
        >
          <div className={cn("w-full", readingCol)}>
            {!preview && (
              <Link
                href="/"
                className="mb-6 inline-flex w-fit items-center gap-1.5 text-sm text-sand-100/70 hover:text-ember-400"
              >
                <ArrowLeft className="size-4" /> <T k="common.back" />
              </Link>
            )}
            {post.location && (
              <p className="flex items-center gap-1.5 text-sm font-medium uppercase tracking-wider text-ember-300">
                <MapPin className="size-4" />
                {post.location}
              </p>
            )}
            <h1 className="mt-3 font-display text-4xl font-semibold leading-tight sm:text-6xl">
              {post.title}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-sand-100/60">
              <span className="flex items-center gap-1.5">
                <Calendar className="size-4" />
                {formatDate(post.published_at) || <T k="post.unpublished" />}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="size-4" />
                {readingTime(post.body)} <T k="post.minRead" />
              </span>
              {post.trip && (
                <Link
                  href={`/trips/${post.trip.slug}`}
                  className="rounded-full bg-white/10 px-3 py-1 hover:bg-white/20"
                >
                  {post.trip.title}
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      {useStory ? (
        <StoryMap
          excerpt={post.excerpt}
          blocks={blocks}
          tracks={post.tracks}
          markers={markers}
          photoPins={photoPins}
        />
      ) : (
        <div className="mx-auto max-w-3xl px-6 py-14">
          {post.excerpt && (
            <p className="mb-8 font-display text-xl leading-relaxed text-sand-100/90">
              {post.excerpt}
            </p>
          )}
          <RichBody
            body={post.body ?? ""}
            photos={post.photos}
            interactions={interactions}
            showIssues={preview}
          />
        </div>
      )}

      <div className={cn(sectionWrap, "pb-14 pt-8")}>
        <div className={readingCol}>
          <Reactions postId={post.id} initial={post.reactions} />
        </div>
      </div>

      {galleryPhotos.length > 0 && (
        <section className={cn(sectionWrap, "pb-14")}>
          <div className={readingCol}>
            <h2 className="mb-5 font-display text-2xl font-semibold">
              <T k="post.gallery" />
            </h2>
            <Gallery photos={galleryPhotos} />
          </div>
        </section>
      )}

      {hasMap && (
        <section
          className={cn(
            sectionWrap,
            "pb-14",
            useStory && "lg:hidden", // desktop story posts show the map in the sticky column
          )}
        >
          <div className={readingCol}>
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 className="font-display text-2xl font-semibold">
                <T k="post.onMap" />
              </h2>
              {post.trip && (
                <Link
                  href={`/trips/${post.trip.slug}/map`}
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm transition hover:border-ember-400 hover:text-ember-400"
                >
                  <Maximize2 className="size-4" /> <T k="post.exploreJourney" />
                </Link>
              )}
            </div>
            <TripMap
              markers={markers}
              tracks={post.tracks}
              photos={photoPins}
              connectPhotos
            />
          </div>
        </section>
      )}

      {/* Elevation + comments span the full content width (not the narrow
          reading column) — they read better wide and fill the space beside
          where the sticky map sat. */}
      <ElevationProfile tracks={post.tracks} wrapClassName={sectionWrap} />

      <section className={cn(sectionWrap, "pb-24")}>
        <Comments postId={post.id} initial={comments} />
      </section>

      {!preview && <SubscribePrompt />}
    </article>
  );
}
