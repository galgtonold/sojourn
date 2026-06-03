// Cookieless anon client for PUBLIC reads (published posts, trips, comments…).
// Safe to use anywhere — request handlers, Server Components, and build-time
// `generateStaticParams` — because it never touches request cookies. All access
// is bounded by Row Level Security.
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env, isSupabaseConfigured } from "@/lib/env";

export function getPublicSupabase() {
  if (!isSupabaseConfigured) return null;
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
