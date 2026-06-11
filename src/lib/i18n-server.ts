import "server-only";
import { cookies } from "next/headers";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALES,
  type Locale,
} from "@/lib/i18n";

// The reader's chosen content language, from the `locale` cookie. Reading the
// cookie opts the calling route into dynamic rendering — required because
// translated bodies are assembled on the server, not swapped on the client like
// UI chrome. Falls back to the default locale for crawlers / first visits.
export async function getReaderLocale(): Promise<Locale> {
  try {
    const store = await cookies();
    const v = store.get(LOCALE_COOKIE)?.value;
    return v && (LOCALES as string[]).includes(v)
      ? (v as Locale)
      : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}
