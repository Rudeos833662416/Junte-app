-- Sky Night: bucket independiente para avatar y portada

insert into storage.buckets (id, name, public)
values ('profiles', 'profiles', true)
on conflict (id) do update set public = true;

drop policy if exists profiles_storage_insert_own on storage.objects;
create policy profiles_storage_insert_own on storage.objects
for insert to authenticated
with check (
  bucket_id = 'profiles'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists profiles_storage_update_own on storage.objects;
create policy profiles_storage_update_own on storage.objects
for update to authenticated
using (
  bucket_id = 'profiles'
  and owner_id = auth.uid()::text
)
with check (
  bucket_id = 'profiles'
  and owner_id = auth.uid()::text
);

drop policy if exists profiles_storage_delete_own on storage.objects;
create policy profiles_storage_delete_own on storage.objects
for delete to authenticated
using (
  bucket_id = 'profiles'
  and owner_id = auth.uid()::text
);
