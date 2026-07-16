-- 0014_storage_media.sql — public-read media bucket for uploaded imagery.
-- Writes go through guarded server actions using the service-role key, so no
-- storage.objects write policy is granted to authenticated users: authorization
-- stays in one place (the action guards) instead of being duplicated here.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Public read of objects in this bucket (the site renders them via next/image).
drop policy if exists media_public_read on storage.objects;
create policy media_public_read on storage.objects
  for select using (bucket_id = 'media');
