import { describe, it, expect } from "vitest";
import {
  flattenBranding,
  parseBrandingRow,
  BRANDING_COLUMNS,
  EMPTY_BRAND_VALUES,
  type BrandValues,
} from "@/lib/branding-fields";

const V: BrandValues = {
  tagline: { de: "Tag", en: "Tagline" },
  heroLead: { de: "Lead", en: "" },
  heroAccent: { de: "Akzent", en: "Accent" },
  kicker: { de: "Kick", en: "Kicker" },
};

describe("branding-fields", () => {
  it("flatten → parse round-trips", () => {
    const flat = flattenBranding("Sojourn", V);
    expect(flat.site_name).toBe("Sojourn");
    expect(flat.hero_lead_de).toBe("Lead");
    expect(flat.hero_accent_en).toBe("Accent");
    expect(parseBrandingRow(flat, "Default")).toEqual({ name: "Sojourn", ...V });
  });

  it("empty name falls back; values are trimmed; missing pairs stay empty", () => {
    const parsed = parseBrandingRow(
      { site_name: "  ", tagline_de: "  Tag  " },
      "Default",
    );
    expect(parsed.name).toBe("Default");
    expect(parsed.tagline.de).toBe("Tag");
    expect(parsed.tagline.en).toBe("");
    expect(parsed.kicker).toEqual({ de: "", en: "" });
  });

  it("a null row yields all defaults", () => {
    expect(parseBrandingRow(null, "Def")).toEqual({
      name: "Def",
      ...EMPTY_BRAND_VALUES,
    });
  });

  it("BRANDING_COLUMNS lists site_name + each pair's de/en", () => {
    expect(BRANDING_COLUMNS).toContain("site_name");
    expect(BRANDING_COLUMNS).toContain("hero_accent_en");
    expect(BRANDING_COLUMNS.length).toBe(9);
  });
});
