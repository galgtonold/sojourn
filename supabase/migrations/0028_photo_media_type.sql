-- Videos live in `photos`, tagged by media_type, with a generated poster image.
alter table public.photos
  add column if not exists media_type text not null default 'image',
  add column if not exists poster_path text,
  add column if not exists poster_url text;

alter table public.photos
  drop constraint if exists photos_media_type_check;
alter table public.photos
  add constraint photos_media_type_check
  check (media_type in ('image', 'video'));
