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

export async function signViewer(
  userId: string,
  key: string,
  nowMs: number,
): Promise<string> {
  const expiry = nowMs + VIEWER_TTL_MS;
  const payload = `${userId}.${expiry}`;
  return `${payload}.${await hmacHex(payload, key)}`;
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
  if (!value || !key) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [userId, expiryRaw, sig] = parts;
  if (!userId || !expiryRaw || !sig) return null;

  const expiry = Number(expiryRaw);
  if (!Number.isFinite(expiry) || nowMs >= expiry) return null;

  const expected = await hmacHex(`${userId}.${expiryRaw}`, key);
  return safeEqual(expected, sig) ? userId : null;
}
