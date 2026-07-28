-- ╔════════════════════════════════════════════════════════════════════════╗
-- ║  Security (S5): narrow the blanket anon DML grant; close the future-     ║
-- ║  table footgun.                                                          ║
-- ║                                                                          ║
-- ║  0020 granted SELECT/INSERT/UPDATE/DELETE on every table — and, via      ║
-- ║  ALTER DEFAULT PRIVILEGES, every FUTURE table — to anon and              ║
-- ║  authenticated. RLS is then the ONLY gate, so a single new table         ║
-- ║  shipped without `enable row level security` would be world-read/write.  ║
-- ║                                                                          ║
-- ║  Anon only ever writes three tables (all via the public API, RLS-gated): ║
-- ║    comments        — INSERT            ("anyone can comment")            ║
-- ║    reactions       — INSERT + DELETE   ("anyone can react"/"remove own") ║
-- ║    comment_likes   — INSERT + DELETE   ("anyone can like"/"remove own")  ║
-- ║  (Interaction votes and push go through the service-role client, so anon ║
-- ║  needs no grant there.) Anon SELECT is left intact for public reads.     ║
-- ╚════════════════════════════════════════════════════════════════════════╝

-- Drop the over-broad write surface from anon (keeps SELECT). TRUNCATE is
-- included because anon currently holds it too, and TRUNCATE bypasses RLS
-- entirely (even though PostgREST doesn't expose it) — no reason for anon to.
revoke insert, update, delete, truncate on all tables in schema public from anon;

-- Re-grant only the writes the public endpoints actually perform. RLS still
-- decides which rows; this is the table-level prerequisite the policies assume.
grant insert on public.comments to anon;
grant insert, delete on public.reactions to anon;
grant insert, delete on public.comment_likes to anon;

-- Secure-by-default for FUTURE tables: undo 0020's automatic grant to anon and
-- authenticated, so a newly-created table is closed until explicitly granted —
-- instead of being exposed the moment it exists. service_role keeps its default
-- (it bypasses RLS and is only ever used by trusted server code).
--
-- NOTE for future migrations: a new table now needs its own explicit
-- `grant ... to anon/authenticated` (alongside `enable row level security` +
-- policies). This is intentional — it fails closed, not open.
alter default privileges in schema public
  revoke select, insert, update, delete on tables from anon, authenticated;
