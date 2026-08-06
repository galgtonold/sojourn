// Browser Supabase client (singleton). Throws when Supabase isn't configured.
"use client";
import { createBrowserClient } from "@supabase/ssr";
import { env, isSupabaseConfigured, SUPABASE_NOT_CONFIGURED } from "@/lib/env";

// The cache is typed from THIS wrapper rather than from `createBrowserClient`
// directly, which reads like a pointless indirection and is not. @supabase/ssr
// declares createBrowserClient as an overload pair, so
// `ReturnType<typeof createBrowserClient>` reads the last signature with its
// type parameters still uninstantiated — and the client collapses to `any`.
// Every downstream callback then loses its contextual type and reports an
// implicit-any, in files that never mention Supabase generics. Going through a
// plain function gives ReturnType one fully resolved signature to read, and
// costs nothing at runtime.
function create() {
  return createBrowserClient(env.supabaseUrl, env.supabaseAnonKey);
}

let cached: ReturnType<typeof create> | null = null;

export function getBrowserSupabase() {
  if (!isSupabaseConfigured) throw new Error(SUPABASE_NOT_CONFIGURED);
  if (!cached) cached = create();
  return cached;
}
