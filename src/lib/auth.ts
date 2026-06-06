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

/** Resolves the signed-in admin user, their role and (for members) granted trips. */
export async function getViewer(): Promise<Viewer> {
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
}
