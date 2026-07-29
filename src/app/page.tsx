import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import { getPostSummaries, getTrips } from "@/lib/content";
import { getBranding } from "@/lib/branding";
import { env } from "@/lib/env";
import { PostCard } from "@/components/post-card";
import { TripCard } from "@/components/trip-card";
import { RevealImage } from "@/components/reveal-image";
import { Reveal } from "@/components/reveal";
import {
  T,
  DocumentTitle,
  LocText,
  BrandKicker,
  BrandHeroLead,
  BrandHeroAccent,
} from "@/components/i18n";
import { coverGradient, formatDate, shareImage } from "@/lib/utils";

// Fully static: prerendered in the default locale and the reader's language is
// swapped in on the client (PostCard / LocText), so it serves from cache. Cached
// indefinitely and refreshed on demand only — admin save/publish (revalidatePath)
// and the translate Edge Function's /api/revalidate callback when i18n lands.
export const revalidate = false;

export default async function HomePage() {
  const { posts, total } = await getPostSummaries({ limit: 6 });
  const { name: siteName } = await getBranding();
  const trips = (await getTrips()).slice(0, 4);
  // The newest entry headlines the hero, and still appears in the grid below so
  // it isn't "missing" from the latest list.
  const hero = posts[0];
  // Background image for the hero: the lead post's cover, else the newest post
  // that has one — so a coverless lead post never leaves the hero a black void.
  const heroCover =
    hero?.cover_image ?? posts.find((p) => p.cover_image)?.cover_image ?? null;

  const base = env.siteUrl.replace(/\/$/, "");
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteName,
    url: base,
    potentialAction: {
      "@type": "SearchAction",
      target: `${base}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <DocumentTitle k="meta.tagline" home />
      {/* ── Immersive hero ─────────────────────────────────────────────── */}
      <section className="relative grain h-dvh min-h-[640px] w-full overflow-hidden">
        {heroCover ? (
          <RevealImage
            src={heroCover}
            alt={hero?.title ?? ""}
            fill
            priority
            sizes="100vw"
            imgClassName="animate-kenburns"
          />
        ) : (
          <div
            aria-hidden
            className="absolute inset-0"
            style={{ backgroundImage: coverGradient(hero?.slug ?? siteName) }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-ink-950/40 via-ink-950/30 to-ink-950" />

        <div className="relative z-10 mx-auto flex h-full max-w-6xl flex-col justify-end px-6 pb-20">
          <p className="animate-float-up text-sm font-medium uppercase tracking-[0.3em] text-ember-300">
            {siteName} — <BrandKicker />
          </p>
          <h1 className="animate-float-up mt-4 max-w-3xl text-balance break-words font-display text-[2rem] font-semibold leading-[1.08] sm:text-7xl sm:leading-[1.05]">
            <BrandHeroLead />{" "}
            <span className="text-gradient-ember">
              <BrandHeroAccent />
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
              <T k="home.readCta" /> “
              <LocText source={hero.title} i18n={hero.i18n} field="title" />”
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

        {posts.length === 0 ? (
          <p className="text-sand-100/60">
            <T k="home.noMore" />
          </p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post, i) => (
              <Reveal key={post.id} index={i}>
                <PostCard post={post} priority={i < 3} />
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

      {/* ── Journeys (trips) ───────────────────────────────────────────── */}
      {trips.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 pb-20 sm:pb-28">
          <Reveal className="mb-8 flex items-end justify-between">
            <div>
              <h2 className="font-display text-3xl font-semibold sm:text-4xl">
                <T k="home.tripsTitle" />
              </h2>
              <p className="mt-2 text-sand-100/60">
                <T k="home.tripsSub" />
              </p>
            </div>
            <Link
              href="/trips"
              className="hidden items-center gap-1 text-sm text-ember-400 hover:gap-2 sm:flex"
            >
              <T k="home.allTrips" /> <ArrowRight className="size-4" />
            </Link>
          </Reveal>
          <div className="grid gap-6 md:grid-cols-2">
            {trips.map((trip, i) => (
              <Reveal key={trip.id} index={i}>
                <TripCard trip={trip} />
              </Reveal>
            ))}
          </div>
        </section>
      )}

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

export async function generateMetadata() {
  const { name } = await getBranding();
  const description = `Latest travel stories and photography from ${name}. Updated ${formatDate(
    new Date().toISOString(),
    "en",
  )}.`;

  // The home page is the URL people actually paste into chats, forums and
  // social posts, and it was the one page with no share image — so a site whose
  // whole point is photography previewed as a line of grey text. Entry and trip
  // pages already offer their own cover; this borrows the newest one, which is
  // both the freshest and the picture the author most recently chose to lead
  // with. See `shareImage` for why it is resized and absolute.
  const { posts } = await getPostSummaries({ limit: 1 });
  const newest = posts[0];
  const images = newest?.cover_image
    ? [
        {
          url: shareImage(newest.cover_image, env.siteUrl),
          alt: newest.cover_alt ?? name,
        },
      ]
    : undefined;

  return {
    alternates: { canonical: "/" },
    description,
    openGraph: { title: name, description, url: "/", images },
    twitter: {
      card: images ? "summary_large_image" : "summary",
      title: name,
      description,
      images,
    },
  };
}
