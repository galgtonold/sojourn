// Server-only: mint a 7-day member-invite link. The raw token rides in the URL;
// only its sha256 hash is stored. Shared by the invite-create and reset-link
// routes so an existing account can be re-issued an onboarding link too.
import "server-only";
import { randomBytes, createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function mintInviteLink(
  admin: SupabaseClient,
  userId: string,
  email: string,
): Promise<string | null> {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const { error } = await admin.from("member_invites").insert({
    token: tokenHash,
    user_id: userId,
    email,
    expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
  });
  if (error) return null;
  return `${env.siteUrl}/admin/welcome?invite=${rawToken}`;
}
