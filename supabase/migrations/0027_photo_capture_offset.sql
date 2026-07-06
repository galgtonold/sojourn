-- Capture-time UTC offset (minutes) from EXIF OffsetTimeOriginal, when present.
-- Lets geotag-from-track place offset-carrying photos exactly and seed the
-- auto-detected trip offset for the rest. `taken_at` now holds the naive local
-- wall-clock (labelled UTC); true UTC = taken_at - taken_at_offset_min.
alter table public.photos
  add column if not exists taken_at_offset_min integer;

comment on column public.photos.taken_at_offset_min is
  'UTC offset in minutes from EXIF OffsetTimeOriginal at capture, if present.';
