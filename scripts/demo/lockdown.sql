-- Make the showcase deployment read-only where it actually has to be.
--
--   Run against the DEMO Supabase project only. Never production.
--   Supabase dashboard → SQL Editor, or `psql "$DEMO_DATABASE_URL" -f this`.
--
-- ── Why the middleware guard is not enough ──────────────────────────────────
--
-- src/lib/demo.ts promises the demo is read-only "for EVERYONE… no account, not
-- even the owner's, that can write through the UI", and src/middleware.ts
-- enforces it on every request that reaches Next.js. The gap is that a good deal
-- of the admin never reaches Next.js: photo deletes, track deletes, interaction
-- deletes and storage uploads all go straight from the browser to PostgREST
-- (see the comment in /api/admin/revalidate, which documents the arrangement).
--
-- /api/demo/login signs the visitor in as a real owner so they can see the
-- admin. RLS then correctly waves those writes through, because as far as the
-- database is concerned they ARE the owner. Middleware cannot intervene in a
-- request it never sees, so the guarantee has to be made where the write lands.
--
-- Grants are checked before policies, so removing the write verbs from
-- `authenticated` ends the question without touching a single policy — and
-- without affecting `service_role`, which is what scripts/demo/seed.mjs uses.
--
-- ── When to re-run ──────────────────────────────────────────────────────────
--
-- After any migration that grants write verbs to `authenticated` (0020 did).
-- The runner only applies migrations *after* the watermark, so already-applied
-- ones cannot re-open this — but a future one could, silently. Re-running this
-- is idempotent and cheap; do it after every demo deploy that applied anything.

-- Public tables: reads stay, writes go.
revoke insert, update, delete, truncate
  on all tables in schema public
  from authenticated;

-- And for anything created later by a migration.
alter default privileges in schema public
  revoke insert, update, delete, truncate on tables from authenticated;

-- Storage: 0043 scopes the photo bucket's update/delete to the owner — which on
-- this deployment is exactly who the demo visitor is signed in as. So the same
-- treatment, one level down.
revoke insert, update, delete on storage.objects from authenticated;

-- What remains for a demo visitor: SELECT on everything the admin renders, which
-- is the entire point of the showcase.
--
-- Verify:
--   select grantee, privilege_type, count(*)
--     from information_schema.role_table_grants
--    where table_schema = 'public' and grantee = 'authenticated'
--    group by 1, 2 order by 2;
--   -- expect SELECT only.
