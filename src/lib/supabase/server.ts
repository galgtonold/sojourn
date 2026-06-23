// Server-side Supabase client wired to Next.js cookies (App Router).
// Throws when Supabase isn't configured — the app requires it (see env.ts).
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { env, isSupabaseConfigured, SUPABASE_NOT_CONFIGURED } from "@/lib/env";

export async function getServerSupabase() {
  if (!isSupabaseConfigured) throw new Error(SUPABASE_NOT_CONFIGURED);
  const cookieStore = await cookies();

  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(
        cookiesToSet: { name: string; value: string; options?: object }[],
      ) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set({ name, value, ...options }),
          );
        } catch {
          // `setAll` is called from a Server Component; safe to ignore because
          // middleware refreshes the session.
        }
      },
    },
  });
}
