import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { ownerRoute } from "@/lib/api/owner-route";
import { BRANDING_TAG } from "@/lib/branding";
import { BRANDING_COLUMNS } from "@/lib/branding-fields";
import { ANALYTICS_PROVIDERS } from "@/lib/telemetry-fields";

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
  // Constrained to the providers the UI offers, so a malformed request can't
  // park an unknown string in the column for the layout to puzzle over.
  analytics_provider: z.enum(ANALYTICS_PROVIDERS).optional(),
});

// Owner-only: persist the blog-wide writing-style guide + branding. RLS has no
// client write policy, so the update goes through the service role.
export const PUT = ownerRoute(schema, async ({ admin, input }) => {
  const update: Record<string, string> = {};
  if (input.writing_style !== undefined) update.writing_style = input.writing_style;
  for (const k of BRANDING_COLUMNS) {
    if (input[k] !== undefined) update[k] = input[k]!.trim();
  }
  if (input.analytics_provider !== undefined) {
    update.analytics_provider = input.analytics_provider;
  }
  if (Object.keys(update).length === 0)
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  // Both are read by the root layout through the same cache tag, so both need
  // the same invalidation — an analytics change that only took effect five
  // minutes later would read as broken.
  const brandingChanged =
    BRANDING_COLUMNS.some((k) => k in update) ||
    "analytics_provider" in update;

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
