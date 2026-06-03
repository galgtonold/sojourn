import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Calendar, Clock, MapPin } from "lucide-react";
import { getComments, getPostBySlug, getPublishedPosts } from "@/lib/content";
import { formatDate, readingTime } from "@/lib/utils";
import { Gallery } from "@/components/gallery";
import { Reactions } from "@/components/reactions";
import { Comments } from "@/components/comments";
import { TripMap, type MapMarker } from "@/components/trip-map";

export async function generateStaticParams() {
  const posts = await getPublishedPosts();
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.excerpt ?? undefined,
    openGraph: {
      title: post.title,
      description: post.excerpt ?? undefined,
      images: post.cover_image ? [post.cover_image] : undefined,
    },
  };
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) notFound();

  const comments = await getComments(post.id);
  const paragraphs = (post.body ?? "").split(/\n{2,}/).filter(Boolean);

  const markers: MapMarker[] = post.locations.map((l) => ({
    id: l.id,
    name: l.name,
    lat: l.lat,
    lng: l.lng,
  }));

  return (
    <article>
      {/* ── Cover ──────────────────────────────────────────────────────── */}
      <header className="relative grain h-[70dvh] min-h-[460px] w-full overflow-hidden">
        {post.cover_image && (
          <Image
            src={post.cover_image}
            alt={post.title}
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-ink-950/30 via-transparent to-ink-950" />

        <div className="relative z-10 mx-auto flex h-full max-w-3xl flex-col justify-end px-6 pb-12">
          <Link
            href="/"
            className="mb-6 inline-flex w-fit items-center gap-1.5 text-sm text-sand-100/70 hover:text-ember-400"
          >
            <ArrowLeft className="size-4" /> Back
          </Link>
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
              {formatDate(post.published_at)}
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

      {/* ── Body ───────────────────────────────────────────────────────── */}
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

        {/* Reactions */}
        <div className="mt-12 border-t border-white/10 pt-8">
          <Reactions postId={post.id} initial={post.reactions} />
        </div>
      </div>

      {/* ── Gallery ────────────────────────────────────────────────────── */}
      {post.photos.length > 0 && (
        <section className="mx-auto max-w-4xl px-6 pb-14">
          <h2 className="mb-5 font-display text-2xl font-semibold">Gallery</h2>
          <Gallery photos={post.photos} />
        </section>
      )}

      {/* ── Map ────────────────────────────────────────────────────────── */}
      {markers.length > 0 && (
        <section className="mx-auto max-w-4xl px-6 pb-14">
          <h2 className="mb-5 font-display text-2xl font-semibold">
            On the map
          </h2>
          <TripMap markers={markers} />
        </section>
      )}

      {/* ── Comments ───────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-6 pb-24">
        <Comments postId={post.id} initial={comments} />
      </section>
    </article>
  );
}
