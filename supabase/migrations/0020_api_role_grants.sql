-- ╔════════════════════════════════════════════════════════════════════════╗
-- ║  API role privileges (portability fix).                                  ║
-- ║                                                                          ║
-- ║  Every table has RLS enabled and policies that reference `anon` /        ║
-- ║  `authenticated` (see 0001/0003/0005/0006). But an RLS policy only       ║
-- ║  decides WHICH ROWS a role may touch — the role still needs the          ║
-- ║  table-level GRANT (SELECT/INSERT/UPDATE/DELETE) as a prerequisite.      ║
-- ║  Those GRANTs were never in the migrations: hosted Supabase happens to   ║
-- ║  apply them via dashboard-configured default privileges, so production   ║
-- ║  works — but a migration-only / self-hosted deployment (the path the     ║
-- ║  README documents: "apply the migration" / `supabase db push`) gets      ║
-- ║  none, and the entire public API fails with                              ║
-- ║  `permission denied for table ...`. RLS stays the row-level gate; this   ║
-- ║  simply grants the privilege the policies assume.                        ║
-- ╚════════════════════════════════════════════════════════════════════════╝

grant usage on schema public to anon, authenticated, service_role;

-- Existing objects.
grant select, insert, update, delete on all tables in schema public
  to anon, authenticated, service_role;
grant usage, select on all sequences in schema public
  to anon, authenticated, service_role;

-- Future objects created by the migration role.
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;

-- Note: function privileges are intentionally NOT broadened here — they are
-- already granted per-function (search RPCs to anon in 0018; is_owner/can_edit_*
-- to authenticated in 0007; ai_usage_summary to authenticated in 0009), and
-- 0007 deliberately hardened them. RLS remains enabled on every table.
