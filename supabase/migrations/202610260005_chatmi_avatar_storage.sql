-- CHATMI / Profile photos (run separately in Supabase SQL Editor).
-- Idempotente: se puede ejecutar de nuevo sin perder datos.
-- Project: vovxtzcngqzdwjddrcis
-- Public photo bucket: uploaded profile images can be viewed by anyone with their URL.
-- Browser can only upload/delete files in the logged-in user's UUID folder.

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values (
  'chatmi-avatars',
  'chatmi-avatars',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "chatmi_avatar_insert_own" on storage.objects;
create policy "chatmi_avatar_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'chatmi-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and lower(storage.extension(name)) in ('jpg', 'png', 'webp')
);

drop policy if exists "chatmi_avatar_read_own" on storage.objects;
create policy "chatmi_avatar_read_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'chatmi-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "chatmi_avatar_delete_own" on storage.objects;
create policy "chatmi_avatar_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'chatmi-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and owner_id = (select auth.uid())::text
);

-- Read-only verification (run after setup):
select id, public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'chatmi-avatars';

select policyname, cmd, roles
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname like 'chatmi_avatar_%'
order by policyname;
