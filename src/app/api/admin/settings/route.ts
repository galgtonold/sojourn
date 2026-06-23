import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { getServerSupabase } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getViewer } from "@/lib/auth";
import { BRANDING_TAG } from "@/lib/branding";

// Owner-only: persist the blog-wide writing-style guide. RLS has no client write
// policy, so the update goes through the service role behind the owner check.
export async function PUT(req: Request) {
  const supabase = await getServerSupabase();
  if (!supabase)
    return NextResponse.json({ error: "not configured" }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const viewer = await getViewer();
  if (!viewer.isOwner)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Partial: the writing-style form sends `writing_style`; the branding form
  // sends `site_name` / `tagline`. Update only what's present.
  const brand = z.string().max(200).optional();
  const parsed = z
    .object({
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
    })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "invalid" }, { status: 400 });

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

  const update: Record<string, string> = {};
  if (parsed.data.writing_style !== undefined)
    update.writing_style = parsed.data.writing_style;
  for (const k of BRAND_KEYS) {
    if (parsed.data[k] !== undefined) update[k] = parsed.data[k]!.trim();
  }
  if (Object.keys(update).length === 0)
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  const brandingChanged = BRAND_KEYS.some((k) => k in update);

  const admin = getAdminSupabase();
  if (!admin)
    return NextResponse.json({ error: "not configured" }, { status: 503 });

  const { error } = await admin
    .from("site_settings")
    .update(update)
    .eq("id", 1);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  // Branding shows on every (statically cached) page via the root layout, so a
  // change must bust the cached value and revalidate everything under it.
  if (brandingChanged) {
    revalidateTag(BRANDING_TAG);
    revalidatePath("/", "layout");
  }

  return NextResponse.json({ ok: true });
}
