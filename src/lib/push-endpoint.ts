/**
 * Is this a URL we are willing to have the server send push messages to?
 *
 * The subscribe endpoint is anonymous by design — a visitor opting their own
 * browser in — and it stored whatever URL it was given, which the push sender
 * later POSTs to. That is a server-side request forgery primitive handed out
 * over an open endpoint: register `http://10.0.0.5:8080/` or
 * `http://169.254.169.254/latest/meta-data/` and the server dutifully calls it,
 * from inside whatever network it happens to be on.
 *
 * Rather than allowlisting the four browser vendors — which breaks the next
 * browser to implement Web Push, and self-hosted push services — this refuses
 * the shapes that have no business being a push endpoint at all: anything not
 * HTTPS, and anything pointing back at the host or its private network.
 *
 * Pure, so the cases below are checked by tests rather than by trying them.
 */
export function isAllowedPushEndpoint(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  // Push endpoints are always HTTPS. This also rules out file:, data: and the
  // rest in one line.
  if (url.protocol !== "https:") return false;
  // Credentials in the URL are never legitimate here and are a redirect trick.
  if (url.username || url.password) return false;

  const host = url.hostname.toLowerCase();
  // A bare name resolves through the host's own DNS — internal services live
  // there. Real push services are fully qualified.
  if (!host.includes(".")) return false;
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  if (host.endsWith(".internal") || host.endsWith(".local")) return false;

  // Literal addresses: refuse loopback, private, link-local and unspecified.
  // A hostname that merely *resolves* to one of these is not caught here — that
  // needs resolution at send time — but the literal form is the cheap half.
  if (isPrivateAddress(host)) return false;
  return true;
}

function isPrivateAddress(host: string): boolean {
  // IPv6, including the ::ffff:10.0.0.1 form browsers occasionally produce.
  if (host.startsWith("[") || host.includes(":")) {
    const v6 = host.replace(/^\[|\]$/g, "").toLowerCase();
    if (v6 === "::1" || v6 === "::") return true;
    // Unique-local and link-local.
    if (/^f[cd][0-9a-f]{2}:/.test(v6) || /^fe80:/.test(v6)) return true;
    const mapped = /::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v6);
    return mapped ? isPrivateAddress(mapped[1]) : false;
  }
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if ([a, b, Number(m[3]), Number(m[4])].some((n) => n > 255)) return false;
  if (a === 0 || a === 127) return true; // unspecified, loopback
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  return false;
}
