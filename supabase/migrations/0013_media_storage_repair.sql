-- Reparación idempotente de Storage para APKs que ya tienen el esquema principal.
-- Ejecutar en Supabase SQL Editor con una cuenta administradora.

insert into storage.buckets (id, name, public)
values ('profiles', 'profiles', true), ('stories', 'stories', true)
on conflict (id) do update set public = excluded.public;

-- Perfiles: cada usuario solo puede cargar, modificar y borrar archivos dentro de su carpeta.
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
using (bucket_id = 'profiles' and owner_id = auth.uid()::text)
with check (bucket_id = 'profiles' and owner_id = auth.uid()::text);

drop policy if exists profiles_storage_delete_own on storage.objects;
create policy profiles_storage_delete_own on storage.objects
for delete to authenticated
using (bucket_id = 'profiles' and owner_id = auth.uid()::text);

-- Historias: cada usuario solo puede cargar y borrar sus propios archivos.
drop policy if exists stories_storage_insert_own on storage.objects;
create policy stories_storage_insert_own on storage.objects
for insert to authenticated
with check (
  bucket_id = 'stories'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists stories_storage_update_own on storage.objects;
create policy stories_storage_update_own on storage.objects
for update to authenticated
using (bucket_id = 'stories' and owner_id = auth.uid()::text)
with check (bucket_id = 'stories' and owner_id = auth.uid()::text);

drop policy if exists stories_storage_delete_own on storage.objects;
create policy stories_storage_delete_own on storage.objects
for delete to authenticated
using (bucket_id = 'stories' and owner_id = auth.uid()::text);
