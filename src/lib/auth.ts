import { cache } from "react";
import { headers } from "next/headers";
import { getServerSupabase } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { VIEWER_HEADER, verifyViewer } from "@/lib/auth-forward";

/** The id middleware already verified for this request, or null.
 *
 *  Null means "verify the session properly", NEVER "no user" — every failure
 *  mode (no header, tampered, expired, no service role, a route outside the
 *  middleware matcher, or no request context at all) lands here and must cost a
 *  round trip rather than correctness. */
async function forwardedUserId(): Promise<string | null> {
  try {
    return await verifyViewer(
      (await headers()).get(VIEWER_HEADER),
      env.supabaseServiceRoleKey,
      Date.now(),
    );
  } catch {
    // headers() throws outside a request scope (unit tests, and any future
    // non-request caller). Degrade to the full path.
    return null;
  }
}

export type Viewer = {
  userId: string | null;
  email: string | null;
  isOwner: boolean;
  /** Trip ids a member may edit. Empty for the owner (who can edit all). */
  tripIds: string[];
};

const EMPTY: Viewer = {
  userId: null,
  email: null,
  isOwner: false,
  tripIds: [],
};

/** Resolves the signed-in admin user, their role and (for members) granted trips.
 *
 *  Memoized per request: the admin layout needs `isOwner` to filter its nav and
 *  every page needs the viewer too, so this was making the same Auth round trip
 *  and `profiles` read twice per load. `cache` dedupes within one request and
 *  never persists across requests, which is what we want for per-user data. */
export const getViewer = cache(async (): Promise<Viewer> => {
  const supabase = await getServerSupabase();
  if (!supabase) return EMPTY;

  // Middleware already verified this session over the network; trust its
  // forwarded id only if the signature checks out, and otherwise verify here.
  let userId = await forwardedUserId();
  let email: string | null = null;
  if (!userId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return EMPTY;
    userId = user.id;
    email = user.email ?? null;
  }

  // profiles and trip_members both key off the user id and not each other. The
  // trip_members read is wasted for owners (who can edit everything), but it
  // costs no wall-clock next to the profiles read it now runs beside.
  // `email` comes along for the fast path, where there is no auth record to read
  // it from. It is a denormalised copy of auth.users.email.
  const [{ data: profile }, { data: memberRows }] = await Promise.all([
    supabase.from("profiles").select("role, email").eq("id", userId).maybeSingle(),
    supabase.from("trip_members").select("trip_id").eq("user_id", userId),
  ]);

  const isOwner = profile?.role === "owner";
  const tripIds = isOwner ? [] : (memberRows ?? []).map((r) => r.trip_id as string);

  return {
    userId,
    // Prefer the auth record when we already paid to read it; profiles is the
    // fallback the forwarded path relies on.
    email: email ?? profile?.email ?? null,
    isOwner,
    tripIds,
  };
});
