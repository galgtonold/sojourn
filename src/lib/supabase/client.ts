// Browser Supabase client (singleton). Throws when Supabase isn't configured.
"use client";
import { createBrowserClient } from "@supabase/ssr";
import { env, isSupabaseConfigured, SUPABASE_NOT_CONFIGURED } from "@/lib/env";

let cached: ReturnType<typeof createBrowserClient> | null = null;

export function getBrowserSupabase() {
  if (!isSupabaseConfigured) throw new Error(SUPABASE_NOT_CONFIGURED);
  if (!cached) {
    cached = createBrowserClient(env.supabaseUrl, env.supabaseAnonKey);
  }
  return cached;
}
