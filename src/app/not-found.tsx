import Link from "next/link";
import { Compass } from "lucide-react";
import { T } from "@/components/i18n";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <Compass className="mx-auto size-10 text-ember-400" />
        <h1 className="mt-6 font-display text-5xl font-semibold">
          <T k="notFound.title" />
        </h1>
        <p className="mt-3 text-sand-100/60">
          <T k="notFound.body" />
        </p>
        <Link
          href="/"
          className="mt-8 inline-block rounded-full bg-ember-500 px-5 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-ember-400"
        >
          <T k="notFound.back" />
        </Link>
      </div>
    </div>
  );
}
