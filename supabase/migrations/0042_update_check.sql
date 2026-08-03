-- Whether this install may ask GitHub if a newer Sojourn exists.
--
-- The check sends nothing about the operator or their readers — it is a plain
-- GET for a public release tag, not telemetry. But it is still an outbound
-- request made by a private journal without being asked, and the honest way to
-- ship one of those is with a switch next to it.
--
-- Default true, because an install that never learns it is out of date is the
-- failure ADR-0002 exists to prevent, and because the answer is only ever
-- fetched while the owner is looking at the Updates page — nothing runs in the
-- background.
--
-- Boolean rather than the empty-string-means-off convention used by
-- analytics_provider: that column has three states (unset, off, vercel) because
-- an env var can supply a default. This one has two.
alter table public.site_settings
  add column if not exists update_check boolean not null default true;

-- No new grant. site_settings is read through the service role and written by
-- the owner-gated settings route, exactly like analytics_provider beside it.
