import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { env, isSupabaseConfigured } from "@/lib/env";

// Refreshes the Supabase session cookie and gates the admin area.
export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });

  // Demo mode (no Supabase): let everything through; admin shows a notice.
  if (!isSupabaseConfigured) return response;

  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: { name: string; value: string; options?: object }[],
      ) {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set({ name, value, ...options }),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isLogin = pathname.startsWith("/admin/login");

  if (pathname.startsWith("/admin") && !isLogin && !user) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }
  if (isLogin && user) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
