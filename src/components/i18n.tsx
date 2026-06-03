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
  type Locale,
} from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Vars = Record<string, string | number>;
type Ctx = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (k: DictKey, vars?: Vars) => string;
};

const I18nCtx = createContext<Ctx | null>(null);

function readCookieLocale(): Locale {
  if (typeof document === "undefined") return DEFAULT_LOCALE;
  const m = document.cookie.match(/(?:^|; )locale=([^;]+)/);
  return normalizeLocale(m?.[1]);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  // Read the saved choice on the client (server always renders the default).
  useEffect(() => {
    setLocaleState(readCookieLocale());
  }, []);

  function setLocale(l: Locale) {
    document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = l;
    setLocaleState(l);
  }

  const t = (k: DictKey, vars?: Vars) => translate(locale, k, vars);
  return (
    <I18nCtx.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nCtx.Provider>
  );
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
