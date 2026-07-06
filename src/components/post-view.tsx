"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Clock,
  MapPin,
  Maximize2,
} from "lucide-react";
import type { Comment, Interaction, PostWithRelations } from "@/lib/types";
import type { PostNavLink } from "@/lib/content";
import { cn, formatDate, readingTime } from "@/lib/utils";
import { localizePostDeep, localizeInteraction } from "@/lib/i18n-content";
import { Gallery } from "@/components/gallery";
import { RichBody } from "@/components/rich-body";
import { parseBody, referencedPhotoIds } from "@/lib/rich";
import { Reactions } from "@/components/reactions";
import { Comments } from "@/components/comments";
import type { MapMarker, PhotoPin } from "@/components/trip-map";

// MapLibre (~200KB) is loaded only when a post actually has a story/trip map —
// most post bundles never pay for it. The maps are client-only anyway.
const StoryMap = dynamic(
  () => import("@/components/story-map").then((m) => m.StoryMap),
  { ssr: false },
);
const TripMap = dynamic(
  () => import("@/components/trip-map").then((m) => m.TripMap),
  { ssr: false },
);
import { ElevationProfile } from "@/components/elevation-profile";
import { SubscribePrompt } from "@/components/subscribe-prompt";
import { RevealImage } from "@/components/reveal-image";
import { BackLink } from "@/components/back-link";
import { ShareButton } from "@/components/share-button";
import { T, useI18n } from "@/components/i18n";

/**
 * Full article view, shared by the public post page and the admin preview.
 * Client component: it receives the RAW post (with its `i18n` overlay) and
 * localizes to the reader's language here, so the public page can be statically
 * cached. Both languages ride along in the payload.
 */
export function PostView({
  post: rawPost,
  comments,
  interactions: rawInteractions = [],
  nav,
  preview = false,
}: {
  post: PostWithRelations;
  comments: Comment[];
  interactions?: Interaction[];
  nav?: { prev: PostNavLink | null; next: PostNavLink | null };
  preview?: boolean;
}) {
  const { locale } = useI18n();
  const post = localizePostDeep(rawPost, locale);
  const interactions = rawInteractions.map((it) =>
    localizeInteraction(it, locale),
  );
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
      takenAtOffsetMin: p.taken_at_offset_min ?? null,
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
  // The hero shares the body's left edge but breathes wider than the reading
  // column — it sits over a full-bleed cover with no second column beside it,
  // so capping the title to 34rem just made a long title wrap into a cramped
  // single column.
  const heroCol = useStory ? "lg:max-w-4xl" : "";

  return (
    <article>
      {preview && (
        <div className="fixed inset-x-0 top-0 z-[100] grid h-9 place-items-center bg-ember-600 px-4 text-center text-sm font-medium text-ink-950">
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

      <header className="relative grain flex min-h-[70dvh] w-full flex-col overflow-hidden">
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
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-ink-950/55 to-transparent" />
        {/* Long, smooth dissolve so the cover melts into the page background —
            and, crucially, keeps the title + location accent readable over bright
            covers (the orange eyebrow sits in the mid zone, so it carries weight). */}
        <div className="absolute inset-x-0 bottom-0 h-4/5 bg-gradient-to-t from-ink-950 via-ink-950/60 to-transparent" />

        <div
          className={cn(
            "relative z-10 mx-auto flex w-full flex-1 flex-col justify-end px-6 pb-12 pt-24",
            useStory ? "max-w-2xl lg:max-w-6xl" : "max-w-3xl",
          )}
        >
          <div
            className={cn(
              // A layered text shadow keeps the hero legible over ANY cover —
              // a tight shadow for crisp edges plus a broad halo that lifts the
              // text off bright/busy photos, independent of the gradient.
              "w-full [text-shadow:0_1px_3px_rgba(10,9,8,0.75),0_3px_26px_rgba(10,9,8,0.6)]",
              heroCol,
            )}
          >
            {!preview && (
              <BackLink
                fallback="/"
                className="mb-6 inline-flex w-fit items-center gap-1.5 rounded-full bg-ink-950/45 px-3.5 py-1.5 text-sm font-medium text-sand-50 ring-1 ring-white/20 backdrop-blur-sm transition hover:bg-ink-950/65 hover:text-ember-300"
              >
                <ArrowLeft className="size-4" /> <T k="common.back" />
              </BackLink>
            )}
            {post.location && (
              <p className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-ember-400">
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
                {formatDate(post.published_at, locale) || (
                  <T k="post.unpublished" />
                )}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="size-4" />
                {readingTime(post.body, post.photos.length)}{" "}
                <T k="post.minRead" />
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
            {!preview && (
              <div className="mt-5">
                <ShareButton title={post.title} />
              </div>
            )}
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

      {/* Fire the subscribe prompt at the end of the article body — not at the
          very bottom of the page, past the gallery, map and comments. */}
      {!preview && <SubscribePrompt />}

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

      <section className={cn(sectionWrap, "pb-12")}>
        <Comments postId={post.id} initial={comments} />
      </section>

      {/* Walk a multi-day trip front-to-back without backtracking through the
          trip page. Chronological: prev = earlier day, next = later day. */}
      {nav && (nav.prev || nav.next) && (
        <nav className={cn(sectionWrap, "pb-24")}>
          <div className="grid gap-3 sm:grid-cols-2">
            {nav.prev ? (
              <Link
                href={`/posts/${nav.prev.slug}`}
                className="group flex flex-col gap-1 rounded-2xl border border-white/10 bg-ink-900/40 p-4 transition hover:border-ember-400/50"
              >
                <span className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-sand-100/50">
                  <ArrowLeft className="size-3.5" /> <T k="post.navPrev" />
                </span>
                <span className="font-display text-lg font-semibold transition group-hover:text-ember-300">
                  {nav.prev.titleI18n[locale] ?? nav.prev.title}
                </span>
              </Link>
            ) : (
              <span className="hidden sm:block" />
            )}
            {nav.next ? (
              <Link
                href={`/posts/${nav.next.slug}`}
                className="group flex flex-col gap-1 rounded-2xl border border-white/10 bg-ink-900/40 p-4 text-right transition hover:border-ember-400/50 sm:items-end"
              >
                <span className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-sand-100/50">
                  <T k="post.navNext" /> <ArrowRight className="size-3.5" />
                </span>
                <span className="font-display text-lg font-semibold transition group-hover:text-ember-300">
                  {nav.next.titleI18n[locale] ?? nav.next.title}
                </span>
              </Link>
            ) : (
              <span className="hidden sm:block" />
            )}
          </div>
        </nav>
      )}
    </article>
  );
}
