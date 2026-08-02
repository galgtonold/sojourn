-- Analytics becomes something the owner can switch on from /admin/settings,
-- instead of an environment variable and a redeploy.
--
-- The split follows who actually wants each thing. Error reporting (Sentry,
-- both halves) stays env-only: only a developer ever wants it, and a developer
-- is comfortable setting a variable. Analytics is the one piece of telemetry a
-- non-technical owner might genuinely ask for — "how many people read this?" —
-- and asking that person to redeploy is the same barrier the first-run setup
-- flow exists to remove.
--
-- Empty means off, which is the default for every install. `NEXT_PUBLIC_ANALYTICS`
-- still works and is the fallback when this is blank, so existing deployments
-- keep whatever they already had (see @/lib/telemetry-fields for the precedence,
-- which mirrors the AI config's DB → env → default rule).
alter table public.site_settings
  add column if not exists analytics_provider text not null default '';

-- No new grant: site_settings is read through the service role and written by
-- the owner-gated settings route, exactly as the branding columns beside it.
