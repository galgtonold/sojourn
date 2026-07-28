-- First-run setup: the owner claim must be atomic. At most one profiles row may
-- hold role='owner', so of two concurrent /api/setup claims exactly one promote
-- succeeds — the loser hits this index (23505), cleans up, and reports
-- "already set up". Nothing else creates owners (the members API only ever
-- writes role='member' and refuses to delete owners), and seed + all known
-- installs hold exactly one owner, so this applies cleanly.
create unique index if not exists profiles_single_owner_idx
  on public.profiles ((role))
  where role = 'owner';
