import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Calendar, Clock, MapPin } from "lucide-react";
import type { Comment, PostWithRelations } from "@/lib/types";
import { formatDate, readingTime } from "@/lib/utils";
import { Gallery } from "@/components/gallery";
import { Reactions } from "@/components/reactions";
import { Comments } from "@/components/comments";
import { TripMap, type MapMarker, type PhotoPin } from "@/components/trip-map";
import { SubscribePrompt } from "@/components/subscribe-prompt";

/** Full article view, shared by the public post page and the admin preview. */
export function PostView({
  post,
  comments,
  preview = false,
}: {
  post: PostWithRelations;
  comments: Comment[];
  preview?: boolean;
}) {
  const paragraphs = (post.body ?? "").split(/\n{2,}/).filter(Boolean);
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
    }));
  const hasMap =
    markers.length > 0 || post.tracks.length > 0 || photoPins.length > 0;

  return (
    <article>
      {preview && (
        <div className="fixed inset-x-0 top-0 z-[80] bg-ember-600 px-4 py-1.5 text-center text-sm font-medium text-ink-950">
          Draft preview{post.published ? "" : " — not published"} ·{" "}
          <Link href={`/admin/posts/${post.id}`} className="underline">
            Back to editor
          </Link>
        </div>
      )}

      <header className="relative grain h-[70dvh] min-h-[460px] w-full overflow-hidden">
        {post.cover_image && (
          <Image
            src={post.cover_image}
            alt={post.cover_alt ?? post.title}
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-ink-950/30 via-transparent to-ink-950" />

        <div className="relative z-10 mx-auto flex h-full max-w-3xl flex-col justify-end px-6 pb-12">
          {!preview && (
            <Link
              href="/"
              className="mb-6 inline-flex w-fit items-center gap-1.5 text-sm text-sand-100/70 hover:text-ember-400"
            >
              <ArrowLeft className="size-4" /> Back
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
              {formatDate(post.published_at) || "Unpublished"}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="size-4" />
              {readingTime(post.body)} min read
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
      </header>

      <div className="mx-auto max-w-3xl px-6 py-14">
        {post.excerpt && (
          <p className="mb-8 font-display text-xl leading-relaxed text-sand-100/90">
            {post.excerpt}
          </p>
        )}
        <div className="space-y-6 text-lg leading-relaxed text-sand-100/80">
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>

        <div className="mt-12 border-t border-white/10 pt-8">
          <Reactions postId={post.id} initial={post.reactions} />
        </div>
      </div>

      {post.photos.length > 0 && (
        <section className="mx-auto max-w-4xl px-6 pb-14">
          <h2 className="mb-5 font-display text-2xl font-semibold">Gallery</h2>
          <Gallery photos={post.photos} />
        </section>
      )}

      {hasMap && (
        <section className="mx-auto max-w-4xl px-6 pb-14">
          <h2 className="mb-5 font-display text-2xl font-semibold">On the map</h2>
          <TripMap markers={markers} tracks={post.tracks} photos={photoPins} />
        </section>
      )}

      <section className="mx-auto max-w-3xl px-6 pb-24">
        <Comments postId={post.id} initial={comments} />
      </section>

      {!preview && <SubscribePrompt />}
    </article>
  );
}
