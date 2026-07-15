import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { env } from "@/lib/env";
import { VIEWER_HEADER, signViewer } from "@/lib/auth-forward";

// Refreshes the Supabase session cookie and gates the admin area.
export async function middleware(request: NextRequest) {
  // The response can't exist yet: its request headers depend on the user, whom
  // we only know after getUser() — which is also what triggers setAll (during a
  // token refresh). So buffer the cookies here and replay them onto the response
  // once it exists. Writing them to a placeholder response we then discarded
  // would silently drop refreshed sessions, i.e. break login.
  const pendingCookies: { name: string; value: string; options?: object }[] = [];

  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: { name: string; value: string; options?: object }[],
      ) {
        pendingCookies.push(...cookiesToSet);
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isLogin = pathname.startsWith("/admin/login");
  // The invite/recovery link establishes its session client-side, so this page
  // must be reachable before a session cookie exists.
  const isWelcome = pathname.startsWith("/admin/welcome");

  if (pathname.startsWith("/admin") && !isLogin && !isWelcome && !user) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }
  if (isLogin && user) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  // Strip any inbound copy before setting our own: the value must only ever be
  // one middleware produced. (It is signed too, so this is belt-and-braces —
  // but an unsigned path must never be reachable by accident.)
  const forwarded = new Headers(request.headers);
  forwarded.delete(VIEWER_HEADER);
  if (user) {
    // Null when the service role isn't configured — that deploy just pays for
    // the second verification in getViewer rather than 500ing here.
    const signed = await signViewer(user.id, env.supabaseServiceRoleKey, Date.now());
    if (signed) forwarded.set(VIEWER_HEADER, signed);
  }

  const response = NextResponse.next({ request: { headers: forwarded } });
  for (const { name, value, options } of pendingCookies) {
    response.cookies.set({ name, value, ...options });
  }
  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
