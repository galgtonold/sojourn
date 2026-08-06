# Sojourn — working notes for Claude

> **Scope: the maintainer's own checkout.** This file is instructions to an
> agent working directly on the deployment, which is why it says to push to
> `main`. It is not the contribution process. If you are contributing, read
> [CONTRIBUTING.md](CONTRIBUTING.md) instead — open an issue, then a PR.
>
> The rest of this file is still worth your time: the gotchas below are real
> ones, each paid for once already.

## Shipping changes (maintainer, working on the deployment)
Production deploys automatically when `main` is updated (Vercel ↔ GitHub).
So once a change is done and verified, **commit and push to `main`** — don't leave
work sitting locally. Contributors: open a PR instead; `verify` runs on it.

**Validate before pushing** (production builds straight from `main`, so never push red):
1. `npm ci` — only needed on a fresh checkout (`node_modules` is gitignored)
2. `npm run typecheck`
3. `npm test`
4. `npm run build`

**Test end-to-end after pushing:** confirm the Vercel build succeeded and spot-check
the affected page(s) on the live site before calling the work done.

Stage files explicitly when committing — `memory/` is untracked but not ignored, so
avoid `git add -A`.

## Stack
Next.js 15 (App Router) · React 19 · Tailwind v4 · Supabase · MapLibre GL · Vercel.
User-facing copy lives in `src/lib/i18n.ts` (en + de) — never hard-code strings.

## Gotchas learned the hard way
- **Rounded image cards: corner fringe needs `.paint-group`.** A bright cover under a
  dark scrim, both clipped by the card's rounded corner, leaves a 1px light arc at the
  corners: each layer antialiases its own ~half-coverage edge pixels against the same
  arc, so the bright cover bleeds through no matter what's painted on top. Bg tweaks,
  insets, hairline rings and removing hover-zoom all failed (see the "Revert … seam"
  commits). The fix: wrap the full-bleed stack (cover + placeholder + scrim) in
  `.paint-group` (globals.css, `opacity: .999`) *inside* the clipped element — opacity
  < 1 forces group rendering, so the stack flattens once and the clip rasterizes once.
  Hover-zoom transforms and the blur placeholder are fine with the group in place.
- **A reasoning model that will not stop reasoning cannot be fixed with a bigger
  cap — turn the thinking off.** `reasoning_content` is billed against
  `max_tokens` and arrives *before* the first byte of the answer, so a model that
  over-deliberates spends the whole budget thinking and returns `finish_reason:
  "length"` with **empty** `message.content`. A JSON caller then throws "Could
  not parse model JSON output". Measured on the proofreader against a real
  4,600-character German article: an 8000 cap produced 8000 reasoning tokens and
  no answer; 32000 produced 32000 and no answer, the thinking visibly circling
  back over sentences it had already cleared. Sending `thinking: {type:
  "disabled"}` returned the same article in ~6s — and caught 5/5 planted errors
  where the reasoning run caught 4/5. Use `ChatOpts.noThinking` for recognition
  tasks (proofreading, classification); leave thinking on for drafting.
  Diagnose from `ai_usage`: `reasoning_tokens ≈ completion_tokens` with an empty
  `response_preview` is this failure exactly.
- **There is no cap escalation any more, deliberately.** The JSON loop used to
  double `max_tokens` on every `length` finish up to 32000. It turned one
  failure into three, each slower than the last, all ending identically, with
  the author waiting through all of them. A retry is now only ever for a
  transient 5xx; anything that came back but did not parse goes straight to the
  single repair pass. Pick a cap that fits the work up front.
- **Raising a cap means raising the route's clock too.** They are one decision. An
  8000-token call on a reasoning model does not fit in Vercel's 60s, and a killed
  function records **nothing** — `recordUsage`/`recordAiFailure` run *after* the
  response returns — so `ai_usage` shows the preceding step succeeding and then
  silence, which reads like "the route was never called". The only trace is a 504
  in the Vercel runtime logs (`get_runtime_errors`), and the client's
  `humanError()` maps a 504's non-JSON body to the *generic* "try again" message,
  not the network one — so the UI actively misleads you. Any route running an
  8000-token call carries `maxDuration = 180`.
- **Tailwind v4 `space-y-*` beats per-child `mt-*`.** Its generated selector has higher
  specificity, so a heading's own `mt-10` is silently overridden, leaving headings flush
  with body text. Own block rhythm on the container with sibling selectors
  (`[&>*+h2]:mt-10`, …), not via `mt-*` on the element.
- **An npm failure that "must be a version skew" is almost certainly `.npmrc`.** The
  repo's `.npmrc` sets `legacy-peer-deps=true`, so peer resolution differs completely
  between a directory that has it and one that does not. The Dockerfile once copied
  only `package.json` and `package-lock.json`, which made the image the sole
  environment resolving peers strictly, and `npm ci` there demanded 48 packages
  "missing from lock file" against a lockfile everything else accepted — killing
  v0.1.3's release build. It reads exactly like npm versions disagreeing, and
  reproducing it in a scratch directory holding just the two files "confirms" that
  false story, because the scratch directory is missing the same file. **Any scratch
  reproduction of a dependency problem must include `.npmrc`.**
- **Never `npm ci` the workspace inside a container.** `npm ci` deletes and rebuilds
  `node_modules`, so `docker run -v "$PWD":/w … npm ci` leaves musl binaries in a glibc
  checkout. CI's lockfile guard did this and the next native module to load blamed the
  lockfile — vitest 4's rolldown reported "Cannot find native binding" for a lock that
  was correct. Copy `package.json`, `package-lock.json` and `.npmrc` somewhere else and
  run it there; `node_modules` is not one of the inputs to the question being asked.
