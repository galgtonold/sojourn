/**
 * Is this a public URL that will carry credentials over plain HTTP?
 *
 * `SUPABASE_PUBLIC_URL` is handed to the visitor's browser, so every Supabase
 * request goes over it — including `POST /auth/v1/token`, which carries the
 * owner's password, and every request after it carrying their session JWT in an
 * Authorization header.
 *
 * The all-in-one stack ships an http:// default because that is correct for
 * local use. The failure mode is the obvious edit: deploy to a VPS, change the
 * host, leave the scheme. Nothing breaks, nothing complains, and the owner's
 * password crosses the network in the clear.
 *
 * Loopback is exempt because there is no network to listen on. Everything else
 * on http: is worth saying out loud.
 */
export function isInsecurePublicUrl(raw: string | undefined | null): boolean {
  if (!raw) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // A malformed URL is someone else's error to report, with a better message.
    return false;
  }
  if (url.protocol !== "http:") return false;
  return !isLoopbackHost(url.hostname.toLowerCase());
}

function isLoopbackHost(host: string): boolean {
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  // Docker's name for the host from inside a container — the default the
  // generated .env.selfhost ships, and genuinely local.
  if (host === "host.docker.internal") return true;
  // mDNS names on the local segment.
  if (host.endsWith(".local")) return true;
  if (host === "::1" || host === "[::1]") return true;
  return /^127\./.test(host);
}

/** The warning itself, so its wording is testable and lives beside the rule. */
export function insecurePublicUrlWarning(raw: string): string {
  return (
    `SOJOURN: SUPABASE_PUBLIC_URL is ${raw} — plain HTTP.\n` +
    `  Everything the browser sends to Supabase crosses the network unencrypted,\n` +
    `  including the password you sign in with and the session token afterwards.\n` +
    `  Put a TLS-terminating proxy in front and set this to its https:// address.`
  );
}
