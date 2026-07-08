-- Record why a background translation failed, so the editor can show a reason
-- instead of a bare "error" with no indication why. Cleared on success.
alter table public.posts add column if not exists translation_error text;
alter table public.trips add column if not exists translation_error text;
