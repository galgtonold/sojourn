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

export type AdminCtx<T> = {
  supabase: ServerSupabase;
  user: User;
  input: T;
};

type Options = {
  /** Reject with 503 unless an AI provider is configured. */
  requireAi?: boolean;
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

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid" }, { status: 400 });
    }

    try {
      const result = await handler({ supabase, user, input: parsed.data });
      return result instanceof Response ? result : NextResponse.json(result);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "error" },
        { status: 502 },
      );
    }
  };
}
