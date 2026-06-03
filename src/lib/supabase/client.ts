// Browser Supabase client (singleton). Returns null in demo mode.
"use client";
import { createBrowserClient } from "@supabase/ssr";
import { env, isSupabaseConfigured } from "@/lib/env";

let cached: ReturnType<typeof createBrowserClient> | null = null;

export function getBrowserSupabase() {
  if (!isSupabaseConfigured) return null;
  if (!cached) {
    cached = createBrowserClient(env.supabaseUrl, env.supabaseAnonKey);
  }
  return cached;
}
