// Shared plumbing for OWNER-only, service-role admin routes — the sibling of
// `adminRoute` for the handful of routes that manage collaborators and site
// settings. They can't use the RLS client (they createUser / delete accounts /
// bypass write policies), so they gate on `requireOwner` and act through the
// service-role client. Each one hand-rolled the identical
// requireOwner→403 / getAdminSupabase→503 / safeParse→400 preamble (and the
// settings route a third variant); this captures it so a handler is only its
// real logic — and the gate/status branches become testable in one place.
import { NextResponse } from "next/server";
import type { z } from "zod";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { requireOwner } from "@/lib/api/admin-auth";

export type AdminSupabase = NonNullable<ReturnType<typeof getAdminSupabase>>;

export type OwnerCtx<T, P = Record<string, string>> = {
  admin: AdminSupabase;
  self: string; // the authenticated owner's user id
  input: T;
  params: P; // resolved dynamic-route params ({} for a non-dynamic route)
};

/**
 * Wraps a handler with the owner gate + service-role client + body validation.
 * The handler may return a `Response` directly (for domain statuses like 404 or
 * a 400/500 it owns) or any JSON-serializable value, wrapped in a 200. A thrown
 * error becomes a 502 rather than an unhandled crash. Dynamic-route `params` are
 * awaited and passed through.
 */
export function ownerRoute<S extends z.ZodTypeAny, P = Record<string, string>>(
  schema: S,
  handler: (ctx: OwnerCtx<z.infer<S>, P>) => Promise<Response | unknown>,
) {
  // Next's route-type check requires the second arg's TYPE to match its
  // RouteContext exactly ({ params: Promise<…> }, never optional/undefined), and
  // Next always passes a context — so it's required here, and `params` is read
  // defensively (a non-dynamic route's context may carry none).
  return async (
    req: Request,
    ctx: { params: Promise<P> },
  ): Promise<Response> => {
    const gate = await requireOwner();
    if (!gate.ok) {
      return NextResponse.json({ error: "forbidden" }, { status: gate.status });
    }
    const admin = getAdminSupabase();
    if (!admin) {
      return NextResponse.json(
        { error: "Service role key not configured" },
        { status: 503 },
      );
    }
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid" }, { status: 400 });
    }
    const params = ((await ctx?.params) ?? {}) as P;
    try {
      const result = await handler({
        admin,
        self: gate.self,
        input: parsed.data,
        params,
      });
      return result instanceof Response ? result : NextResponse.json(result);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "error" },
        { status: 502 },
      );
    }
  };
}
