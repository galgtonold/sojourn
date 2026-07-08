import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoute, type AdminCtx } from "@/lib/api/admin-route";
import { reorderPhotos } from "@/lib/db/photos";

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
  try {
    const { orderedIds, manual } = await reorderPhotos(supabase, input.postId, {
      order: input.order,
      mode: input.mode,
    });
    return { ok: true, order: orderedIds, manualOrder: manual };
  } catch (e) {
    const message = e instanceof Error ? e.message : "reorder failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
