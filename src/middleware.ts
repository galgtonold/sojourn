import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { env } from "@/lib/env";
import { VIEWER_HEADER, signViewer } from "@/lib/auth-forward";
import { resolveAdminRoute, resolvePublicRoute } from "@/lib/admin-route";
import { getSetupState, type SetupState } from "@/lib/setup";
import { demoBlocks } from "@/lib/demo";

// Once an install is claimed it stays claimed — there is no un-claim flow — so
// remember that and stop querying. Only the positive is cached: remembering
// "needs-setup" would keep redirecting after a successful claim (setup then
// bounces back to login, and round it goes), and remembering "unknown" would
// pin a transient outage for the life of the instance.
let claimed = false;
async function claimState(): Promise<SetupState> {
  if (claimed) return "configured";
  const state = await getSetupState();
  if (state === "configured") claimed = true;
  return state;
}

// Refreshes the Supabase session cookie and gates the admin area.
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // The showcase deployment refuses writes from everyone, and it refuses them
  // here — in front of every route — because the admin API has no single auth
  // gate to hook (see @/lib/demo). Nothing below this runs for a blocked
  // request, so no handler can be reached by a path nobody thought about.
  if (env.demoMode && demoBlocks(pathname, request.method)) {
    return NextResponse.json({ error: "demo" }, { status: 403 });
  }

  // API routes are matched only for the guard above. Everything below is about
  // pages — sending an API call into the setup funnel would answer a fetch with
  // a redirect to HTML.
  if (pathname.startsWith("/api/")) return NextResponse.next();

  // Public routes: an unclaimed install funnels every visitor into setup, so a
  // deploy can't quietly sit there unclaimed after landing the operator on an
  // empty home page. Deliberately before any session work — the auth check
  // below is a network round-trip to Supabase, which no public page view
  // should ever pay for. After the first claimed request this costs nothing.
  if (!pathname.startsWith("/admin")) {
    const destination = resolvePublicRoute(await claimState());
    return destination
      ? NextResponse.redirect(new URL(destination, request.url))
      : NextResponse.next();
  }

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
    pathname,
    Boolean(user),
    claimState,
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
  matcher: [
    // Every page: all except API routes, Next's build output, and anything with
    // a file extension (sw.js, manifest.webmanifest, icon.svg, robots.txt,
    // sitemap.xml). Public pages match so an unclaimed install can funnel them
    // into setup; they never touch Supabase once the claim is cached.
    "/((?!api|_next|.*\\..*).*)",
    // Plus the endpoints demo mode has to be able to refuse — nothing else
    // under /api is matched. Keep in step with @/lib/demo (a test checks it).
    "/api/admin/:path*",
    "/api/comments",
  ],
};
