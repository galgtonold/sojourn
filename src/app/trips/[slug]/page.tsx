import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Camera, Compass, MapPin, Route } from "lucide-react";
import { getPublishedPostsByTrip, getTrips } from "@/lib/content";
import { getReaderLocale } from "@/lib/i18n-server";
import { localizePost, localizeTrip } from "@/lib/i18n-content";
import { formatDate } from "@/lib/utils";
import { formatDistance } from "@/lib/gpx";
import { PostCard } from "@/components/post-card";
import { T } from "@/components/i18n";

// Dynamic: trip + post-card text is localized to the reader's language.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const trips = await getTrips();
  const trip = trips.find((t) => t.slug === slug);
  if (!trip) return {};
  return { title: trip.title, description: trip.summary ?? undefined };
}

export default async function TripPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const locale = await getReaderLocale();
  const trips = await getTrips();
  const found = trips.find((t) => t.slug === slug);
  if (!found) notFound();
  const trip = localizeTrip(found, locale);

  const tripPosts = (await getPublishedPostsByTrip(trip.id)).map((p) =>
    localizePost(p, locale),
  );
  const tracks = tripPosts.flatMap((p) => p.tracks);
  const waypointCount = tripPosts.reduce((s, p) => s + p.locations.length, 0);
  const photoCount = tripPosts.reduce(
    (s, p) => s + p.photos.filter((ph) => ph.lat != null && ph.lng != null).length,
    0,
  );
  const totalDistance = tracks.reduce((s, t) => s + (t.distance_m ?? 0), 0);
  const hasMap = tracks.length > 0 || waypointCount > 0 || photoCount > 0;

  return (
    <div className="mx-auto max-w-6xl px-6 pb-24 pt-28">
      <p className="text-sm uppercase tracking-[0.25em] text-ember-300">
        <T k="trips.trip" />
      </p>
      <h1 className="mt-2 font-display text-4xl font-semibold sm:text-6xl">
        {trip.title}
      </h1>
      {trip.summary && (
        <p className="mt-3 max-w-2xl text-lg text-sand-100/70">{trip.summary}</p>
      )}
      <p className="mt-2 text-sm text-sand-100/50">
        {trip.start_date && formatDate(trip.start_date, locale)}
        {trip.end_date && ` – ${formatDate(trip.end_date, locale)}`} ·{" "}
        {tripPosts.length}{" "}
        <T k="trips.entries" />
      </p>

      {hasMap && (
        <Link
          href={`/trips/${trip.slug}/map`}
          className="group mt-8 flex items-center justify-between gap-4 rounded-3xl border border-white/10 bg-ink-900 p-6 transition hover:border-ember-400/50 hover:bg-ink-800"
        >
          <div className="min-w-0">
            <h2 className="font-display text-2xl font-semibold">
              <T k="trips.exploreTitle" />
            </h2>
            <p className="mt-1 text-sand-100/60">
              <T k="trips.exploreBody" />
            </p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-sand-100/70">
              {totalDistance > 0 && (
                <span className="flex items-center gap-1.5">
                  <Route className="size-4 text-ember-400" />
                  {formatDistance(totalDistance)}
                </span>
              )}
              {photoCount > 0 && (
                <span className="flex items-center gap-1.5">
                  <Camera className="size-4 text-ember-400" />
                  <T k="trips.photos" vars={{ n: photoCount }} />
                </span>
              )}
              {waypointCount > 0 && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="size-4 text-ember-400" />
                  <T k="trips.stops" vars={{ n: waypointCount }} />
                </span>
              )}
            </div>
          </div>
          <ArrowRight className="size-6 shrink-0 text-ember-400 transition-transform group-hover:translate-x-1" />
        </Link>
      )}

      {tripPosts.length > 0 ? (
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {tripPosts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      ) : (
        <div className="mt-10 flex flex-col items-center gap-3 rounded-3xl border border-dashed border-white/10 bg-ink-900/40 px-6 py-16 text-center">
          <Compass className="size-8 text-sand-100/30" />
          <p className="max-w-sm text-sand-100/60">
            <T k="trips.empty" />
          </p>
        </div>
      )}
    </div>
  );
}
