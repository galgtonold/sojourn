import { getTrips } from "@/lib/content";
import { Reveal } from "@/components/reveal";
import { TripCard } from "@/components/trip-card";
import { T, DocumentTitle } from "@/components/i18n";
import { defaultTitle } from "@/lib/i18n";

export const metadata = {
  title: defaultTitle("meta.trips"),
  alternates: { canonical: "/trips" },
};
// Static, on-demand revalidation — trip card text/dates are localized on the client.
export const revalidate = false;

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
          <Reveal key={trip.id} index={i}>
            <TripCard trip={trip} />
          </Reveal>
        ))}
      </div>
    </div>
  );
}
