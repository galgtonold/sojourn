import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getTrips } from "@/lib/content";
import { Reveal } from "@/components/reveal";
import { RevealImage } from "@/components/reveal-image";
import { T, DocumentTitle, LocText, LocDate } from "@/components/i18n";
import { defaultTitle } from "@/lib/i18n";

export const metadata = { title: defaultTitle("meta.trips") };
// Static + ISR — trip card text/dates are localized on the client.
export const revalidate = 3600;

export default async function TripsPage() {
  const trips = await getTrips();

  return (
    <div className="mx-auto max-w-6xl px-6 pb-24 pt-28">
      <DocumentTitle k="meta.trips" />
      <h1 className="font-display text-4xl font-semibold sm:text-5xl">
        <T k="trips.title" />
      </h1>
      <p className="mt-2 max-w-xl text-sand-100/60">
        <T k="trips.subtitle" />
      </p>

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        {trips.map((trip, i) => (
          <Reveal key={trip.id} delay={i * 0.05}>
            <Link
              href={`/trips/${trip.slug}`}
              className="group relative block aspect-[16/10] overflow-hidden rounded-3xl bg-ink-800"
            >
              <div className="paint-group absolute inset-0">
                {trip.cover_image && (
                  <RevealImage
                    src={trip.cover_image}
                    alt={trip.title}
                    fill
                    sizes="(max-width: 768px) 100vw, 50vw"
                    imgClassName="transition-transform duration-700 group-hover:scale-105"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/20 to-transparent" />
              </div>
              <div className="absolute inset-x-0 bottom-0 p-6">
                <h2 className="font-display text-3xl font-semibold">
                  <LocText source={trip.title} i18n={trip.i18n} field="title" />
                </h2>
                {trip.summary && (
                  // Clamp to two lines (like article cards) — an unclamped
                  // summary grows the overlay upward and pushes the title off
                  // the top of the fixed-ratio card, especially on mobile.
                  <p className="mt-1.5 line-clamp-2 max-w-md text-sand-100/70">
                    <LocText
                      source={trip.summary}
                      i18n={trip.i18n}
                      field="summary"
                    />
                  </p>
                )}
                <p className="mt-3 flex items-center gap-2 text-xs text-sand-100/50">
                  {trip.start_date && <LocDate value={trip.start_date} />}
                  {trip.end_date && (
                    <>
                      {" – "}
                      <LocDate value={trip.end_date} />
                    </>
                  )}
                  <ArrowRight className="size-4 text-ember-400 transition-transform group-hover:translate-x-1" />
                </p>
              </div>
            </Link>
          </Reveal>
        ))}
      </div>
    </div>
  );
}
