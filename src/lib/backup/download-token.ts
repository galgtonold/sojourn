/**
 * The one signal a plain download link can give back to the page.
 *
 * A `<a download>` is the right way to download a file — the browser starts it,
 * streams to disk and shows its own progress — but it tells JavaScript nothing,
 * so the page cannot know when the server has finished assembling the archive
 * and the download has actually begun. On a photo-heavy site that is a minute of
 * a button looking like nothing happened.
 *
 * The trick is old and reliable: the page sends a token in the query, the route
 * echoes it back as a cookie, and cookies arrive with the response HEADERS —
 * which is precisely the moment the archive is ready and the first byte is on
 * its way. The page polls for its own token and stops saying "preparing".
 *
 * Nothing here is a secret. The token identifies one click, not one person, and
 * the route's actual authorization is `requireOwner`.
 */
export const DOWNLOAD_COOKIE = "sojourn-export";

/**
 * Tokens go into a `Set-Cookie` header, so anything that could end one early
 * has to be refused rather than escaped. A caller-supplied string is echoed
 * back verbatim otherwise, which is header injection with extra steps.
 */
export function safeToken(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return /^[A-Za-z0-9-]{1,64}$/.test(raw) ? raw : null;
}

/**
 * `Max-Age` is short on purpose: the cookie is a one-shot signal, not state, and
 * a stale one would make the next download look instantly finished.
 */
export function downloadCookie(token: string): string {
  return `${DOWNLOAD_COOKIE}=${token}; Path=/; Max-Age=30; SameSite=Lax`;
}
