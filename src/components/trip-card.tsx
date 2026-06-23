import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Trip } from "@/lib/types";
import { RevealImage } from "@/components/reveal-image";
import { coverGradient } from "@/lib/utils";
import { LocText, LocDate } from "@/components/i18n";

/** A trip as an image-forward card. Shared by the Trips index and the home page. */
export function TripCard({ trip }: { trip: Trip }) {
  return (
    <Link
      href={`/trips/${trip.slug}`}
      className="group relative block aspect-[16/10] overflow-hidden rounded-3xl bg-ink-800"
    >
      <div className="paint-group absolute inset-0">
        {trip.cover_image ? (
          <RevealImage
            src={trip.cover_image}
            alt={trip.title}
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            imgClassName="transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <div
            aria-hidden
            className="absolute inset-0"
            style={{ backgroundImage: coverGradient(trip.slug || trip.title) }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/20 to-transparent" />
      </div>
      <div className="absolute inset-x-0 bottom-0 p-6">
        <h2 className="font-display text-3xl font-semibold">
          <LocText source={trip.title} i18n={trip.i18n} field="title" />
        </h2>
        {trip.summary && (
          // Clamp to two lines — an unclamped summary grows the overlay upward
          // and pushes the title off the top of the fixed-ratio card.
          <p className="mt-1.5 line-clamp-2 max-w-md text-sand-100/70">
            <LocText source={trip.summary} i18n={trip.i18n} field="summary" />
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
  );
}
