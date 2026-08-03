// Shared plumbing for authenticated admin POST routes.
//
// Every admin route repeats the same preamble: get the server Supabase client
// (503 if Supabase isn't configured), require a signed-in user (401), and
// validate the JSON body against a zod schema (400). The AI routes additionally
// require AI to be configured (503) and wrap their work so a thrown error
// becomes a clean 502 instead of an unhandled crash. This factory captures all
// of that so each route only contains its real logic.

import { NextResponse } from "next/server";
import type { z } from "zod";
import type { User } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/supabase/server";
import { getAiConfig } from "@/lib/ai-config";

export type ServerSupabase = NonNullable<
  Awaited<ReturnType<typeof getServerSupabase>>
>;

export type ProfileRole = "owner" | "member";

export type AdminCtx<T> = {
  supabase: ServerSupabase;
  user: User;
  input: T;
  /**
   * The caller's role, already proven to exist. Routes that are owner-only
   * should pass `requireOwner` rather than checking this by hand — it is here
   * for the routes whose behaviour merely *differs* by role.
   */
  role: ProfileRole;
};

type Options = {
  /** Reject with 503 unless an AI provider is configured. */
  requireAi?: boolean;
  /** Reject with 403 unless the caller is the site owner. */
  requireOwner?: boolean;
};

/**
 * Wraps a handler with auth + body validation. The handler may return a
 * `Response` directly (for domain-specific statuses like 403/404) or any
 * JSON-serializable value, which is wrapped in a 200 response.
 */
export function adminRoute<S extends z.ZodTypeAny>(
  schema: S,
  handler: (ctx: AdminCtx<z.infer<S>>) => Promise<Response | unknown>,
  options: Options = {},
) {
  return async (req: Request): Promise<Response> => {
    const supabase = await getServerSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "not configured" }, { status: 503 });
    }
    if (options.requireAi && !(await getAiConfig()).isAiConfigured) {
      return NextResponse.json(
        { error: "AI is not configured" },
        { status: 503 },
      );
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // A session is not a permission.
    //
    // This used to end at "there is a user", which made every admin route
    // reachable by anyone holding any Supabase session — and Supabase issued
    // those to anyone who asked until 0043. Even with signups closed, "signed
    // in" and "allowed" are different questions, and the three AI routes that
    // read nothing from the database (homogenize, section, proofread) had no
    // second question to fall back on: RLS never saw a query to filter, so the
    // request body went straight to a 32,000-token generation billed to the
    // operator's provider key.
    //
    // Capability in this schema comes from a `profiles` row — that is what
    // is_owner() and can_edit_post() read, and it is written only by the
    // first-run claim and by the owner adding a member. Requiring one here puts
    // every route behind the same rule the tables are behind.
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    const role = (profile as { role?: string } | null)?.role;
    if (role !== "owner" && role !== "member") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (options.requireOwner && role !== "owner") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid" }, { status: 400 });
    }

    try {
      const result = await handler({
        supabase,
        user,
        input: parsed.data,
        role,
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
