// The single owner of the branding fields and their flat↔nested conversion.
// site_settings stores branding as nine FLAT columns (site_name, tagline_de, …);
// the app works with a NESTED shape ({ name, tagline: {de,en}, … }). Before this
// module that mapping — and the column list — was hand-written across four files
// (the loader, the form's save payload, the settings route's schema/keys, the
// i18n Brand shape), so adding a field was a four-file lockstep edit and none of
// it was tested. Everything about "what branding fields exist and how they
// flatten" lives here now.
import type { LangPair } from "@/lib/i18n";

// Per-language fields: nested key ↔ flat column prefix. `site_name` is single-
// valued and handled outside this list.
export const BRAND_PAIR_FIELDS = [
  { key: "tagline", col: "tagline" },
  { key: "heroLead", col: "hero_lead" },
  { key: "heroAccent", col: "hero_accent" },
  { key: "kicker", col: "kicker" },
] as const;

export type BrandPairKey = (typeof BRAND_PAIR_FIELDS)[number]["key"];

/** The nested per-language branding copy (no name). Empty in a language means
 *  "use the localized default". */
export type BrandValues = Record<BrandPairKey, LangPair>;

/** Full branding: the single name plus the per-language copy. */
export type Branding = { name: string } & BrandValues;

export const EMPTY_BRAND_VALUES: BrandValues = Object.fromEntries(
  BRAND_PAIR_FIELDS.map((f) => [f.key, { de: "", en: "" }]),
) as BrandValues;

// The flat column names (site_name + each pair's _de/_en), for a SELECT, the
// settings route's schema, and its update loop.
const PAIR_COLUMNS = BRAND_PAIR_FIELDS.flatMap(
  (f) => [`${f.col}_de`, `${f.col}_en`] as const,
);
export const BRANDING_COLUMNS = ["site_name", ...PAIR_COLUMNS] as const;

/** Flat site_settings row → nested Branding. Trims every value; an empty name
 *  falls back to `fallbackName`, an empty pair stays "". A null row → defaults. */
export function parseBrandingRow(
  row: Record<string, unknown> | null | undefined,
  fallbackName: string,
): Branding {
  const s = row ?? {};
  const pair = (col: string): LangPair => ({
    de: (s[`${col}_de`] as string | undefined)?.trim() || "",
    en: (s[`${col}_en`] as string | undefined)?.trim() || "",
  });
  const values = Object.fromEntries(
    BRAND_PAIR_FIELDS.map((f) => [f.key, pair(f.col)]),
  ) as BrandValues;
  return {
    name: (s.site_name as string | undefined)?.trim() || fallbackName,
    ...values,
  };
}

/** Nested values (+ name) → the flat payload the settings route expects. */
export function flattenBranding(
  name: string,
  values: BrandValues,
): Record<string, string> {
  const out: Record<string, string> = { site_name: name };
  for (const f of BRAND_PAIR_FIELDS) {
    out[`${f.col}_de`] = values[f.key].de;
    out[`${f.col}_en`] = values[f.key].en;
  }
  return out;
}
