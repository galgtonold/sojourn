// Service-role Supabase client for trusted server code (API routes, admin
// actions). Bypasses RLS — NEVER import this into client components.
//
// 38 sibling modules enforce that with `server-only`, which turns a client
// import into a build error. This one, which hands out the key that ignores
// every policy in the database, was asking politely in a comment. Now it is the
// same build error as everywhere else.
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env, isServiceRoleConfigured } from "@/lib/env";

export function getAdminSupabase() {
  if (!isServiceRoleConfigured) return null;
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
