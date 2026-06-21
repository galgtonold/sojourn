import { Suspense } from "react";
import { SearchBox } from "@/components/search-box";
import { SearchResults } from "@/components/search-results";
import { T, DocumentTitle } from "@/components/i18n";
import { defaultTitle } from "@/lib/i18n";

export const metadata = { title: defaultTitle("search.title") };

// Static shell: the box + headings prerender and serve instantly. The actual
// search runs on the client against /api/search (one shared embedding, parallel
// hybrid searches), with a spinner — instead of a full server-rendered
// navigation per query.
export default function SearchPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 pb-24 pt-28">
      <DocumentTitle k="search.title" />
      <h1 className="font-display text-4xl font-semibold sm:text-5xl">
        <T k="search.title" />
      </h1>
      <p className="mt-2 text-sand-100/60">
        <T k="search.subtitle" />
      </p>

      <div className="mt-8 max-w-xl">
        <Suspense>
          <SearchBox />
        </Suspense>
      </div>

      <Suspense>
        <SearchResults />
      </Suspense>
    </div>
  );
}
