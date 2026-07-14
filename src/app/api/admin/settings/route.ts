import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { ownerRoute } from "@/lib/api/owner-route";
import { BRANDING_TAG } from "@/lib/branding";

// Partial: the writing-style form sends `writing_style`; the branding form sends
// `site_name` / `tagline` / …. Update only what's present.
const brand = z.string().max(200).optional();
const schema = z.object({
  writing_style: z.string().max(8000).optional(),
  site_name: z.string().max(80).optional(),
  tagline_de: brand,
  tagline_en: brand,
  hero_lead_de: brand,
  hero_lead_en: brand,
  hero_accent_de: brand,
  hero_accent_en: brand,
  kicker_de: brand,
  kicker_en: brand,
});

const BRAND_KEYS = [
  "site_name",
  "tagline_de",
  "tagline_en",
  "hero_lead_de",
  "hero_lead_en",
  "hero_accent_de",
  "hero_accent_en",
  "kicker_de",
  "kicker_en",
] as const;

// Owner-only: persist the blog-wide writing-style guide + branding. RLS has no
// client write policy, so the update goes through the service role.
export const PUT = ownerRoute(schema, async ({ admin, input }) => {
  const update: Record<string, string> = {};
  if (input.writing_style !== undefined) update.writing_style = input.writing_style;
  for (const k of BRAND_KEYS) {
    if (input[k] !== undefined) update[k] = input[k]!.trim();
  }
  if (Object.keys(update).length === 0)
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  const brandingChanged = BRAND_KEYS.some((k) => k in update);

  const { error } = await admin.from("site_settings").update(update).eq("id", 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Branding shows on every (statically cached) page via the root layout, so a
  // change must bust the cached value and revalidate everything under it.
  if (brandingChanged) {
    revalidateTag(BRANDING_TAG);
    revalidatePath("/", "layout");
  }
  return { ok: true };
});
