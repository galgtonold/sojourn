import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoute, type AdminCtx } from "@/lib/api/admin-route";
import { orderByCaptureTime } from "@/lib/photo-order";

// Persist a post's photo order. Two modes:
//   • { order: [ids…] } — an explicit arrangement from drag-to-reorder. Flips
//     the post to manual so later uploads append instead of reshuffling.
//   • { mode: "time" } — (re)apply chronological order by capture time. Clears
//     the manual flag so uploads keep auto-sorting.
// RLS ensures the caller may only touch photos of a post they can edit.
const schema = z
  .object({
    postId: z.string().uuid(),
    order: z.array(z.string().uuid()).optional(),
    mode: z.literal("time").optional(),
  })
  .refine((v) => v.order?.length || v.mode === "time", {
    message: "order or mode required",
  });

export const POST = adminRoute(schema, reorder);

async function reorder({ supabase, input }: AdminCtx<z.infer<typeof schema>>) {
  const { postId } = input;

  const { data: rows, error } = await supabase
    .from("photos")
    .select("id, taken_at, created_at, sort_order")
    .eq("post_id", postId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const photos = rows ?? [];
  if (!photos.length) return { ok: true, order: [], manualOrder: false };

  let orderedIds: string[];
  let manual: boolean;

  if (input.order?.length) {
    // Honour the given order, but only for ids that really belong to this post;
    // append any the client omitted (in their current order) so nothing is lost.
    const known = new Set(photos.map((p) => p.id));
    const given = input.order.filter((id) => known.has(id));
    const givenSet = new Set(given);
    const rest = photos
      .filter((p) => !givenSet.has(p.id))
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((p) => p.id);
    orderedIds = [...given, ...rest];
    manual = true;
  } else {
    orderedIds = orderByCaptureTime(photos).map((p) => p.id);
    manual = false;
  }

  // Write a dense, unique sort_order = final position, so ties (and the gaps
  // the old upload numbering left) can never resurface.
  for (let i = 0; i < orderedIds.length; i++) {
    const { error: uErr } = await supabase
      .from("photos")
      .update({ sort_order: i })
      .eq("id", orderedIds[i]);
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });
  }

  const { error: pErr } = await supabase
    .from("posts")
    .update({ photos_manual_order: manual })
    .eq("id", postId);
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  return { ok: true, order: orderedIds, manualOrder: manual };
}
