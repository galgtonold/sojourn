// Cookieless anon client for PUBLIC reads (published posts, trips, comments…).
// Safe to use anywhere — request handlers, Server Components, and build-time
// `generateStaticParams` — because it never touches request cookies. All access
// is bounded by Row Level Security.
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env, isSupabaseConfigured, SUPABASE_NOT_CONFIGURED } from "@/lib/env";

export function getPublicSupabase() {
  if (!isSupabaseConfigured) throw new Error(SUPABASE_NOT_CONFIGURED);
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
