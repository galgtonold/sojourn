// Middleware already verifies the session (a network round trip to Supabase
// Auth); without this the page's getViewer() verifies it a second time for the
// same request, because React cache() cannot span middleware -> render.
//
// The forwarded value is SIGNED, and that is not paranoia: NextResponse.next({
// request: { headers } }) only rewrites what the downstream render sees, so this
// header never reaches the browser and cannot be captured — but a client can
// still SEND it. Middleware's matcher is /admin/:path*, so /api/admin/* is not
// covered; an unsigned header would be trusted there from anyone. Signing means
// forgery is impossible regardless of which route reads it.
//
// No `server-only`: this module runs in BOTH the edge middleware and the node
// render, and is a pure function over strings so it can be tested directly.

export const VIEWER_HEADER = "x-sojourn-viewer";

/** Short by design: it only has to outlive one request. */
export const VIEWER_TTL_MS = 60_000;

const enc = new TextEncoder();

async function hmacHex(message: string, key: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Compare without leaking where two equal-length digests diverge. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const VIEWER_KEY_LABEL = "sojourn:viewer-forward:v1";

// The service-role key is a general-purpose secret (it also bypasses RLS
// elsewhere). Using it verbatim as the HMAC key here would mean this module's
// signing key IS the service-role key — rotating one rotates the other, and a
// digest produced here is indistinguishable from a digest some future feature
// might produce by HMACing the same raw secret for an unrelated purpose.
// HMACing the service-role key with a fixed, purpose-specific label first
// derives a key that is bound to viewer-forwarding only: still deterministic
// (sign and verify compute the same thing from the same secret), but no longer
// the raw secret itself.
async function deriveSigningKey(key: string): Promise<string> {
  return hmacHex(VIEWER_KEY_LABEL, key);
}

export async function signViewer(
  userId: string,
  key: string,
  nowMs: number,
): Promise<string | null> {
  // The service role is genuinely optional (see env.ts / isServiceRoleConfigured):
  // a deploy without it must not throw here. crypto.subtle.importKey rejects a
  // zero-length key, so without this guard every /admin/* request in middleware
  // would 500 (including /admin/login) on such a deploy. Fail safe: return null
  // and let the caller fall back to full session verification.
  if (!key) return null;
  const expiry = nowMs + VIEWER_TTL_MS;
  const payload = `${userId}.${expiry}`;
  const signingKey = await deriveSigningKey(key);
  return `${payload}.${await hmacHex(payload, signingKey)}`;
}

/**
 * The user id when the value was genuinely produced by signViewer with this key
 * and has not expired; otherwise null. Callers MUST treat null as "verify the
 * session properly" — never as "no user".
 */
export async function verifyViewer(
  value: string | null | undefined,
  key: string,
  nowMs: number,
): Promise<string | null> {
  try {
    if (!value || !key) return null;
    const parts = value.split(".");
    if (parts.length !== 3) return null;
    const [userId, expiryRaw, sig] = parts;
    // Nothing signViewer produces can have an empty part (userId is a UUID,
    // expiryRaw is nowMs + TTL, sig is a 64-char hex digest) — but garbage like
    // "uid.100." or ".100.sig" still splits into exactly 3 parts, so this is the
    // only thing standing between that input and a returned "" (falsy, but NOT
    // null — breaking the "null means unverified" contract for any caller doing
    // `=== null`).
    if (!userId || !expiryRaw || !sig) return null;

    const expiry = Number(expiryRaw);
    if (!Number.isFinite(expiry) || nowMs >= expiry) return null;

    const signingKey = await deriveSigningKey(key);
    // Authenticate expiryRaw — the RAW string — not the parsed `expiry` number.
    // Number(expiryRaw) is loose (" 123", "0x10", "+123", "1e999" all coerce to a
    // finite number), so if this ever hashed the *parsed* value instead, then
    // "uid.+<expiry>.sig" would reuse the signature computed for "uid.<expiry>.sig"
    // and forge a valid token that merely spells the same instant differently.
    // Hashing the raw string ties the signature to the exact bytes on the wire.
    const expected = await hmacHex(`${userId}.${expiryRaw}`, signingKey);
    return safeEqual(expected, sig) ? userId : null;
  } catch (err) {
    // No input here should ever throw (the `!key` check above is the one case
    // WebCrypto would reject), but this must never be structural: an unexpected
    // WebCrypto failure has to look like "no valid header" to middleware, not a
    // 500. Log only a message — never the key or signature material.
    console.warn(
      "verifyViewer: unexpected failure, treating as unverified:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}
