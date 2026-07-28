import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { env } from "@/lib/env";
import { VIEWER_HEADER, signViewer } from "@/lib/auth-forward";
import { resolveAdminRoute } from "@/lib/admin-route";
import { getSetupState } from "@/lib/setup";

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

  // Deciding here rather than inside the pages means a redirect is a real 307:
  // an in-page `redirect()` resolves only after Next has streamed the layout,
  // so the visitor watches an empty shell before being sent on.
  const destination = await resolveAdminRoute(
    request.nextUrl.pathname,
    Boolean(user),
    getSetupState,
  );

  // This returns early, before the main response (and its cookie replay)
  // further down is ever built. getUser() above is what populates
  // pendingCookies (on a token refresh), so replay it onto the redirect too —
  // otherwise a rotated refresh token is buffered and then discarded here.
  // That bites hardest when a signed-in viewer hits the login page: the
  // follow-up request would re-present the OLD refresh token, surviving only
  // on Supabase's reuse-detection grace window.
  if (destination) {
    const redirect = NextResponse.redirect(new URL(destination, request.url));
    for (const { name, value, options } of pendingCookies) {
      redirect.cookies.set({ name, value, ...options });
    }
    return redirect;
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
