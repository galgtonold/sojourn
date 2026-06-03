import Link from "next/link";
import Image from "next/image";
import { ArrowRight, MapPin } from "lucide-react";
import { getPostSummaries } from "@/lib/content";
import { env } from "@/lib/env";
import { PostCard } from "@/components/post-card";
import { Reveal } from "@/components/reveal";
import { T } from "@/components/i18n";
import { formatDate } from "@/lib/utils";

// Re-render from the database at most once a minute (ISR) so new entries and
// edits surface without a redeploy.
export const revalidate = 60;

export default async function HomePage() {
  const { posts, total } = await getPostSummaries({ limit: 9 });
  const [hero, ...rest] = posts;

  return (
    <>
      {/* ── Immersive hero ─────────────────────────────────────────────── */}
      <section className="relative grain h-dvh min-h-[640px] w-full overflow-hidden">
        {hero?.cover_image && (
          <Image
            src={hero.cover_image}
            alt={hero.title}
            fill
            priority
            sizes="100vw"
            className="animate-kenburns object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-ink-950/40 via-ink-950/30 to-ink-950" />

        <div className="relative z-10 mx-auto flex h-full max-w-6xl flex-col justify-end px-6 pb-20">
          <p className="animate-float-up text-sm font-medium uppercase tracking-[0.3em] text-ember-300">
            {env.siteName} — <T k="home.kicker" />
          </p>
          <h1 className="animate-float-up mt-4 max-w-3xl font-display text-5xl font-semibold leading-[1.05] sm:text-7xl">
            <T k="home.heroLeadA" />{" "}
            <span className="text-gradient-ember">
              <T k="home.heroLeadB" />
            </span>
            .
          </h1>

          {hero && (
            <Link
              href={`/posts/${hero.slug}`}
              className="animate-float-up group mt-8 inline-flex w-fit items-center gap-3 rounded-full bg-sand-50 px-5 py-3 text-sm font-semibold text-ink-950 transition hover:bg-ember-400"
            >
              {hero.location && (
                <span className="flex items-center gap-1 text-ink-700">
                  <MapPin className="size-4" />
                  {hero.location}
                </span>
              )}
              <T k="home.readCta" /> “{hero.title}”
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </Link>
          )}
        </div>
      </section>

      {/* ── Latest entries ─────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
        <Reveal className="mb-10 flex items-end justify-between">
          <div>
            <h2 className="font-display text-3xl font-semibold sm:text-4xl">
              <T k="home.latest" />
            </h2>
            <p className="mt-2 text-sand-100/60">
              <T k="home.latestSub" />
            </p>
          </div>
          <Link
            href="/posts"
            className="hidden items-center gap-1 text-sm text-ember-400 hover:gap-2 sm:flex"
          >
            <T k="home.allEntries" /> <ArrowRight className="size-4" />
          </Link>
        </Reveal>

        {rest.length === 0 ? (
          <p className="text-sand-100/60">
            <T k="home.noMore" />
          </p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((post, i) => (
              <Reveal key={post.id} delay={i * 0.05}>
                <PostCard post={post} />
              </Reveal>
            ))}
          </div>
        )}

        {total > posts.length && (
          <div className="mt-10 text-center">
            <Link
              href="/posts"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold transition hover:border-ember-400 hover:text-ember-400"
            >
              <T k="home.browseAll" vars={{ n: total }} />
              <ArrowRight className="size-4" />
            </Link>
          </div>
        )}
      </section>

      {/* ── Map teaser ─────────────────────────────────────────────────── */}
      <section className="border-y border-white/5 bg-ink-900">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-6 py-16 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-3xl font-semibold">
              <T k="home.mapTitle" />
            </h2>
            <p className="mt-2 max-w-md text-sand-100/60">
              <T k="home.mapBody" vars={{ n: total }} />
            </p>
          </div>
          <Link
            href="/map"
            className="group inline-flex items-center gap-3 rounded-full border border-white/15 px-5 py-3 text-sm font-semibold transition hover:border-ember-400 hover:text-ember-400"
          >
            <T k="home.exploreMap" />
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </section>
    </>
  );
}

export const metadata = {
  description: `Latest travel stories and photography from ${env.siteName}. Updated ${formatDate(
    new Date().toISOString(),
  )}.`,
};
