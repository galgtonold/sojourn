import { z } from "zod";
import { adminRoute, type AdminCtx } from "@/lib/api/admin-route";
import { buildTripBrief } from "@/lib/ai/trip-brief";

export const maxDuration = 60;

const schema = z.object({ postId: z.string().uuid() });

// Distils this post's earlier trip days into a short continuity brief. Its own
// route (not folded into outline) so the summary call gets its own time budget.
// Best-effort — returns { brief: "" } on any failure so generation never blocks.
export const POST = adminRoute(schema, tripBrief);

async function tripBrief({ supabase, user, input }: AdminCtx<z.infer<typeof schema>>) {
  try {
    const brief = await buildTripBrief(supabase, input.postId, { userId: user.id });
    return { brief };
  } catch {
    return { brief: "" };
  }
}
