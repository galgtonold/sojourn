-- Sojourn — make stories findable by their photos' places (Approach A).
-- A denormalized posts.place_index, maintained by a trigger from each post's
-- photos' place_name + nearby_places, folded into the post full-text vector.
set search_path = public, extensions;

alter table public.posts add column if not exists place_index text;

-- Recompute one post's place_index: space-joined DISTINCT non-blank places of
-- its photos (place_name + each nearby-landmark candidate). SECURITY DEFINER so
-- it works no matter who writes the triggering photo row (RLS admin or service
-- role); it only ever writes place_index for the one post id.
create or replace function public.recompute_post_place_index(p_post_id uuid)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  update public.posts p
  set place_index = (
    select nullif(string_agg(v, ' '), '')
    from (
      select distinct btrim(val) as v
      from (
        select place_name as val from public.photos where post_id = p_post_id
        union all
        select unnest(nearby_places) as val from public.photos where post_id = p_post_id
      ) raw
      where val is not null and btrim(val) <> ''
    ) d
  )
  where p.id = p_post_id;
$$;

-- Keep place_index fresh whenever a photo's place data (or its parent post)
-- changes. `update of` limits firing to place-affecting column changes, so a
-- caption-only edit does not trigger a recompute.
create or replace function public.photos_place_index_trg()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if (tg_op = 'DELETE') then
    perform public.recompute_post_place_index(old.post_id);
    return old;
  end if;
  perform public.recompute_post_place_index(new.post_id);
  if (tg_op = 'UPDATE' and new.post_id is distinct from old.post_id) then
    perform public.recompute_post_place_index(old.post_id);
  end if;
  return new;
end;
$$;

drop trigger if exists photos_place_index on public.photos;
create trigger photos_place_index
after insert or delete or update of place_name, nearby_places, post_id
on public.photos
for each row execute function public.photos_place_index_trg();

-- Regenerate the post full-text vector to add place_index at weight B. Keeps all
-- existing title/excerpt/body/location + de/en i18n weights from migration 0015.
drop index if exists posts_search_idx;
alter table public.posts drop column if exists search_tsv;
alter table public.posts add column search_tsv tsvector
  generated always as (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(i18n->'de'->>'title', '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(i18n->'en'->>'title', '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(excerpt, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(i18n->'de'->>'excerpt', '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(i18n->'en'->>'excerpt', '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(location, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(place_index, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(body, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(i18n->'de'->>'body', '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(i18n->'en'->>'body', '')), 'C')
  ) stored;
create index posts_search_idx on public.posts using gin(search_tsv);

-- Backfill place_index for every post from current photo data (immediately makes
-- stories findable by their photos' existing place_names, before any Photon run).
do $$
declare r record;
begin
  for r in select id from public.posts loop
    perform public.recompute_post_place_index(r.id);
  end loop;
end $$;

-- These are internal maintenance functions (the trigger + backfill call them);
-- they must NOT be callable from the public PostgREST RPC surface. Triggers fire
-- regardless of EXECUTE grants, so revoking is safe.
revoke execute on function public.recompute_post_place_index(uuid) from public, anon, authenticated;
revoke execute on function public.photos_place_index_trg() from public, anon, authenticated;
