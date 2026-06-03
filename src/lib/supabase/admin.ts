// Service-role Supabase client for trusted server code (API routes, admin
// actions). Bypasses RLS — NEVER import this into client components.
import { createClient } from "@supabase/supabase-js";
import { env, isServiceRoleConfigured } from "@/lib/env";

export function getAdminSupabase() {
  if (!isServiceRoleConfigured) return null;
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
