"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALES,
  normalizeLocale,
  translate,
  type DictKey,
  type LangPair,
  type Locale,
} from "@/lib/i18n";
import { cn, formatDate } from "@/lib/utils";
import { env } from "@/lib/env";

type Vars = Record<string, string | number>;

/** Editable, per-language branding copy. Empty in a language → localized default. */
export type Brand = {
  tagline: LangPair;
  heroLead: LangPair;
  heroAccent: LangPair;
  kicker: LangPair;
};
const EMPTY_BRAND: Brand = {
  tagline: { de: "", en: "" },
  heroLead: { de: "", en: "" },
  heroAccent: { de: "", en: "" },
  kicker: { de: "", en: "" },
};

type Ctx = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (k: DictKey, vars?: Vars) => string;
  // Editable branding, supplied by the server layout from the DB. The name is a
  // single value; the rest is per-language. Lives here so any client chrome can
  // read it and swap with the reader's language.
  siteName: string;
  brand: Brand;
};

const I18nCtx = createContext<Ctx | null>(null);

export function readCookieLocale(): Locale {
  if (typeof document === "undefined") return DEFAULT_LOCALE;
  const m = document.cookie.match(/(?:^|; )locale=([^;]+)/);
  return normalizeLocale(m?.[1]);
}

export function I18nProvider({
  children,
  siteName = env.siteName,
  brand = EMPTY_BRAND,
}: {
  children: ReactNode;
  siteName?: string;
  brand?: Brand;
}) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  // Read the saved choice on the client (server always renders the default).
  useEffect(() => {
    const l = readCookieLocale();
    setLocaleState(l);
    document.documentElement.lang = l;
  }, []);

  function setLocale(l: Locale) {
    document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = l;
    setLocaleState(l);
  }

  const t = (k: DictKey, vars?: Vars) => translate(locale, k, vars);
  return (
    <I18nCtx.Provider value={{ locale, setLocale, t, siteName, brand }}>
      {children}
    </I18nCtx.Provider>
  );
}

// Editable branding copy that swaps with the reader's language, falling back to
// the localized default when that language is left blank. Each renders nothing
// but its text, so it drops into existing chrome in place of a plain <T>.
export function BrandTagline() {
  const { locale, t, brand } = useI18n();
  return <>{brand.tagline[locale] || t("footer.tagline")}</>;
}
export function BrandKicker() {
  const { locale, t, brand } = useI18n();
  return <>{brand.kicker[locale] || t("home.kicker")}</>;
}
export function BrandHeroLead() {
  const { locale, t, brand } = useI18n();
  return <>{brand.heroLead[locale] || t("home.heroLeadA")}</>;
}
export function BrandHeroAccent() {
  const { locale, t, brand } = useI18n();
  return <>{brand.heroAccent[locale] || t("home.heroLeadB")}</>;
}

export function useI18n(): Ctx {
  const c = useContext(I18nCtx);
  if (!c) throw new Error("useI18n must be used within I18nProvider");
  return c;
}

export function useT() {
  return useI18n().t;
}

/** Inline translated string — usable inside server components. */
export function T({ k, vars }: { k: DictKey; vars?: Vars }) {
  return <>{useI18n().t(k, vars)}</>;
}

/** The reader's chosen content locale, from context. */
export function useLocale(): Locale {
  return useI18n().locale;
}

/**
 * Client-localized DB content text. Static pages render in the default locale on
 * the server; this swaps to the reader's language on hydration (like `T` does
 * for chrome), reading the per-row `i18n` overlay. Both languages ship in the
 * payload — that's the deliberate cost of serving the page from cache.
 */
export function LocText({
  source,
  i18n,
  field,
}: {
  source: string | null | undefined;
  i18n?: Partial<Record<Locale, Record<string, unknown>>> | null;
  field: string;
}) {
  const { locale } = useI18n();
  const tr = i18n?.[locale]?.[field];
  return <>{(typeof tr === "string" && tr) || source || ""}</>;
}

/** A date formatted in the reader's locale on the client. */
export function LocDate({
  value,
  fallback,
}: {
  value: string | null | undefined;
  fallback?: ReactNode;
}) {
  const { locale } = useI18n();
  const s = formatDate(value ?? null, locale);
  return <>{s || fallback || ""}</>;
}

/**
 * Localizes the document <title> on the client to match the chosen locale,
 * matching the root layout's "%s · Site" template (or "Site — %s" for home).
 * Pages keep their static, default-locale `metadata` for SSR/SEO; this updates
 * the visible tab title reactively (incl. on language switch). Renders nothing.
 */
export function DocumentTitle({
  k,
  vars,
  home = false,
}: {
  k: DictKey;
  vars?: Vars;
  home?: boolean;
}) {
  const { locale, siteName } = useI18n();
  useEffect(() => {
    const value = translate(locale, k, vars);
    const title = home ? `${siteName} — ${value}` : `${value} · ${siteName}`;
    document.title = title;
    // A page's static-metadata <title> is rendered in the default locale for
    // SSR/SEO and can be (re)committed after this effect during initial,
    // heavy-page hydration (e.g. /map), clobbering the value we just set.
    // Re-assert on the next ticks so the localized title wins.
    const ids = [0, 300, 900].map((d) =>
      setTimeout(() => {
        document.title = title;
      }, d),
    );
    return () => ids.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, k, home, siteName]);
  return null;
}

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale } = useI18n();
  return (
    <div className={cn("flex items-center gap-0.5 text-xs", className)}>
      {LOCALES.map((l) => (
        <button
          key={l}
          onClick={() => setLocale(l)}
          aria-pressed={locale === l}
          className={cn(
            "rounded-full px-2 py-1 uppercase transition",
            locale === l
              ? "bg-white/10 text-sand-50"
              : "text-sand-100/50 hover:text-sand-100",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
