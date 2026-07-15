// Owner-only read/write of the AI provider config in app_secrets.
//
// GET reports PRESENCE, never secrets: a secret field's value is always "" and
// only a masked hint goes out. Because a DB value overrides env, the response
// also carries each field's `source` — without it the UI could not show which of
// the two is actually winning, and a stray DB value would silently shadow a
// working env var forever. DELETE is that escape hatch.
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { ownerRoute } from "@/lib/api/owner-route";
import { requireOwner } from "@/lib/api/admin-auth";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { AI_CONFIG_TAG, readAiSecrets } from "@/lib/ai-config";
import {
  AI_FIELD_KEYS,
  isSecretField,
  maskSecret,
  readAiEnv,
  resolveAiConfig,
  resolveAiSources,
  type AiFieldKey,
} from "@/lib/ai-config-fields";

const fieldKey = z.enum(AI_FIELD_KEYS);

// GET has no body, so ownerRoute (which parses one) doesn't fit; gate by hand.
export async function GET(): Promise<Response> {
  const gate = await requireOwner();
  if (!gate.ok) {
    return NextResponse.json({ error: "forbidden" }, { status: gate.status });
  }
  if (!getAdminSupabase()) {
    return NextResponse.json(
      { error: "Service role key not configured" },
      { status: 503 },
    );
  }
  const db = await readAiSecrets();
  const raw = readAiEnv();
  const cfg = resolveAiConfig(db, raw);
  const sources = resolveAiSources(db, raw);

  const fields = Object.fromEntries(
    AI_FIELD_KEYS.map((k) => [
      k,
      {
        source: sources[k],
        // Secrets never leave the server — the mask is the only hint.
        value: isSecretField(k) ? "" : cfg[k],
        masked: isSecretField(k) ? maskSecret(cfg[k]) : "",
      },
    ]),
  );
  return NextResponse.json({ fields });
}

const putSchema = z.object({
  values: z.record(fieldKey, z.string().max(500)),
});

export const PUT = ownerRoute(putSchema, async ({ admin, self, input }) => {
  const rows = Object.entries(input.values)
    .map(([key, value]) => ({
      key: key as AiFieldKey,
      value: (value ?? "").trim(),
      updated_by: self,
    }))
    .filter((r) => r.value !== "");
  if (rows.length === 0) {
    // Nothing to store. Clearing a field is DELETE's job, not an empty PUT —
    // otherwise "save" on a blank form would silently wipe config.
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const { error } = await admin.from("app_secrets").upsert(rows, { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidateTag(AI_CONFIG_TAG);
  return { ok: true };
});

const deleteSchema = z.object({ keys: z.array(fieldKey).min(1) });

export const DELETE = ownerRoute(deleteSchema, async ({ admin, input }) => {
  const { error } = await admin.from("app_secrets").delete().in("key", input.keys);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidateTag(AI_CONFIG_TAG);
  return { ok: true };
});
