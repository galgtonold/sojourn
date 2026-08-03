// "Is there a newer Sojourn?" — asked of GitHub, only when the owner is looking.
//
// This is the one outbound request the admin makes on the operator's behalf, so
// it is worth being precise about what it is and is not. It sends no identifier,
// no site URL and nothing about any reader; it is an unauthenticated GET for a
// public release tag, the same request `curl` would make. It also does not run
// on a schedule — it happens while /admin/settings/updates is open, and the
// answer is cached for six hours so opening the page repeatedly does not repeat
// it. The owner can switch it off entirely (site_settings.update_check).

import "server-only";

/** Upstream, not the operator's fork: the question is when *Sojourn* releases,
 *  not when their own copy last moved. Overridable for anyone maintaining a
 *  genuine downstream. */
const REPO = process.env.SOJOURN_RELEASE_REPO || "galgtonold/sojourn";

/** Six hours. Long enough that a busy admin session is one request; short
 *  enough that "there's a new version" arrives the day it does. */
const REVALIDATE_SECONDS = 6 * 60 * 60;

export type ReleaseCheck =
  /** GitHub answered and named a release. */
  | { ok: true; tag: string; url: string }
  /**
   * It did not answer usefully. Deliberately distinct from "you are up to
   * date", because they are different facts and only one of them is reassuring.
   * A private repo 404s here, as does a repo with tags but no published release.
   */
  | { ok: false; reason: "unreachable" };

type GithubRelease = { tag_name?: unknown; html_url?: unknown };

export async function latestRelease(): Promise<ReleaseCheck> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/releases/latest`,
      {
        headers: {
          accept: "application/vnd.github+json",
          // GitHub rejects API requests without one.
          "user-agent": "sojourn-update-check",
        },
        // Five seconds, then give up. This runs during a page render, and an
        // admin page that hangs because GitHub is slow is a worse outcome than
        // one that says it could not check.
        signal: AbortSignal.timeout(5000),
        next: { revalidate: REVALIDATE_SECONDS },
      },
    );
    if (!res.ok) return { ok: false, reason: "unreachable" };

    const body = (await res.json()) as GithubRelease;
    const tag = typeof body.tag_name === "string" ? body.tag_name : "";
    if (!tag) return { ok: false, reason: "unreachable" };

    return {
      ok: true,
      tag,
      url:
        typeof body.html_url === "string"
          ? body.html_url
          : `https://github.com/${REPO}/releases`,
    };
  } catch {
    // Offline, DNS-blocked, rate-limited, timed out — all the same answer to
    // the only question the page asks, and none of them worth a stack trace in
    // an operator's logs.
    return { ok: false, reason: "unreachable" };
  }
}
