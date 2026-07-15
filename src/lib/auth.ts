import { cache } from "react";
import { getServerSupabase } from "@/lib/supabase/server";

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

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return EMPTY;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const isOwner = profile?.role === "owner";

  let tripIds: string[] = [];
  if (!isOwner) {
    const { data } = await supabase
      .from("trip_members")
      .select("trip_id")
      .eq("user_id", user.id);
    tripIds = (data ?? []).map((r) => r.trip_id as string);
  }

  return {
    userId: user.id,
    email: user.email ?? null,
    isOwner,
    tripIds,
  };
});
