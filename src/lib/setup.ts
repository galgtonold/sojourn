import "server-only";
import { getAdminSupabase } from "@/lib/supabase/admin";

// First-run detection. "unknown" means we cannot tell — no service role, or the
// owner lookup failed (e.g. migrations not applied yet) — and callers degrade
// gracefully: the login page skips its setup redirect, the setup page shows the
// manual instructions instead of the claim form.
export type SetupState = "needs-setup" | "configured" | "unknown";

type AdminClient = NonNullable<ReturnType<typeof getAdminSupabase>>;

/** Whether an owner profile exists; null when the lookup itself failed. */
export async function hasOwner(admin: AdminClient): Promise<boolean | null> {
  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "owner")
    .limit(1);
  if (error) return null;
  return ((data as unknown[] | null)?.length ?? 0) > 0;
}

export async function getSetupState(): Promise<SetupState> {
  const admin = getAdminSupabase();
  if (!admin) return "unknown";
  const owned = await hasOwner(admin);
  if (owned === null) return "unknown";
  return owned ? "configured" : "needs-setup";
}
