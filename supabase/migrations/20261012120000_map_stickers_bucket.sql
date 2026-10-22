-- The map-stickers bucket holds AI Draw and scene-map stickers. It was created
-- by hand in the dashboard, so a fresh project (a self-hosted install) never
-- got it: sticker uploads failed and every sticker was kept inline in the
-- map's row instead. Its access policies are in 20260702202038; this creates
-- the bucket itself, public like the original. Existing projects already have
-- it, so nothing changes there.
insert into storage.buckets (id, name, public)
values ('map-stickers', 'map-stickers', true)
on conflict (id) do nothing;
