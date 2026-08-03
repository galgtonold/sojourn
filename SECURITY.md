# Security policy

## Reporting a vulnerability

**Please do not open a public issue.**

Use GitHub's private reporting — [Security → Report a vulnerability][advisory] on
this repository. It goes only to the maintainer and lets us fix the problem
before it is public. If that is unavailable to you, email
**philipp.gergen@web.de** with `SOJOURN SECURITY` in the subject.

Useful things to include, in rough order of usefulness:

- what an attacker gets, and what they need to start (an account? a link? nothing?)
- the shortest path to reproduce it
- which version — the running version is shown at **Settings → Updates** in the
  admin, and at `/api/health`
- how you deployed: Vercel, Docker, or a bare checkout; hosted Supabase or self-hosted

## What to expect

This is a personal project maintained by one person, so response times are
honest rather than aspirational:

| | |
| --- | --- |
| Acknowledgement | within 3 days |
| Initial assessment | within 7 days |
| Fix for a critical issue | as fast as I can, and I will tell you what "as fast as I can" looks like |

You will get credit in the advisory and the release notes unless you would
rather not. There is no bounty programme — this project has no revenue.

## Supported versions

Only the **latest release** is supported. There are no backported fixes: the
update path is designed so that moving forward is the cheap option, and database
migrations apply themselves at the release seam
(see [ADR-0002](docs/adr/0002-updates-and-schema-migrations.md)).

## Things that are intentional, and not vulnerabilities

Reporting these is welcome but they are known and deliberate:

- **The Supabase anon key is public.** It is compiled into every page, as it is
  in every Supabase app. Row-level security is the control, not the key's
  secrecy. If you find a query that returns something RLS should have withheld,
  *that* is a vulnerability — please report it.
- **All content is world-readable by design.** Trips, posts, photos, comments and
  reactions are meant to be shared by URL. There are no reader accounts.
  Unpublished posts and trips are a different matter and must stay private.
- **The first-run claim window.** A freshly deployed, unclaimed install can be
  claimed by whoever reaches it first, for a bounded period
  (`SETUP_WINDOW_MINUTES`, default 60). This is documented in the README, and the
  advice to claim your install before pointing a domain at it is there for a
  reason. A way to *re-open* that window on an already-claimed install would be a
  vulnerability.

## If you self-host

Two things do more for your security than anything else in this file:

1. **Turn off public sign-ups** on your Supabase project (Authentication → Sign
   In / Providers). The README's *Going live* section covers this.
2. **Keep `SUPABASE_SERVICE_ROLE_KEY` server-side.** It bypasses row-level
   security entirely. It must never appear in a `NEXT_PUBLIC_*` variable, a
   client component, or a build argument.

[advisory]: https://github.com/galgtonold/sojourn/security/advisories/new
