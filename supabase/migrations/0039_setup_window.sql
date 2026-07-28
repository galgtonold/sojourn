-- The claim window. /admin/setup lets the first visitor claim an unclaimed
-- install, which is friction-free but means a deploy nobody finishes sits there
-- with its ownership up for grabs. This bounds that: claiming is only allowed
-- for SETUP_WINDOW_MINUTES (default 60) after this timestamp.
--
-- Anchored in the database rather than process uptime on purpose — the app runs
-- serverless on Vercel, where there is no long-running server to restart. The
-- equivalent of "restart the container to get another window" is therefore:
--
--   update public.site_settings set setup_opened_at = now() where id = 1;
--
-- which is exactly what the expired setup page tells the operator to run.
--
-- Existing installs backfill to the moment this migration runs, which is the
-- right semantic: the window opens when the schema is installed. An install
-- that already has an owner never consults it.
alter table public.site_settings
  add column if not exists setup_opened_at timestamptz not null default now();

-- Which deployment last opened the window. Restarting the server (or
-- redeploying) reopens it on an unclaimed install, which is the friendlier way
-- back in than the SQL above — and it is not a weakening: only whoever controls
-- the deployment can restart it, so it proves the same thing a setup token
-- would have. NULL on existing rows means "unknown deployment", so the first
-- run after this migration opens a window, exactly as a fresh install would.
alter table public.site_settings
  add column if not exists setup_instance text;
