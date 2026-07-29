import "server-only";
import { getServerSupabase } from "@/lib/supabase/server";
import { env } from "@/lib/env";

export type OwnerGate =
  | { ok: true; self: string }
  | { ok: false; status: number };

/**
 * Confirms the caller is the authenticated site owner. Returns the owner's user
 * id (`self`) on success, or a status (401 unauth / 403 not owner) on failure.
 * Shared by the members routes, which all hand-rolled an identical copy.
 */
export async function requireOwner(): Promise<OwnerGate> {
  // Second layer behind the middleware guard. Every caller of this gate is a
  // mutation reached through the service-role client — the one client RLS can't
  // hold back — so on the read-only showcase deployment none of them may run,
  // even if the middleware matcher is edited carelessly later.
  if (env.demoMode) return { ok: false, status: 403 };

  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401 };
  const { data: prof } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (prof?.role !== "owner") return { ok: false, status: 403 };
  return { ok: true, self: user.id };
}
