# Sojourn — working notes for Claude

## Shipping changes (do this by default)
Production deploys automatically when `main` is updated (Vercel ↔ GitHub).
So once a change is done and verified, **commit and push to `main`** — don't leave
work sitting locally.

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
- **Tailwind v4 `space-y-*` beats per-child `mt-*`.** Its generated selector has higher
  specificity, so a heading's own `mt-10` is silently overridden, leaving headings flush
  with body text. Own block rhythm on the container with sibling selectors
  (`[&>*+h2]:mt-10`, …), not via `mt-*` on the element.
