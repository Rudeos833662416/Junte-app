-- Corrección de permisos de Storage para perfiles, portadas e Historias.
-- Ejecutar en Supabase SQL Editor con una cuenta administradora.
-- Esta versión compara owner_id de forma segura, independientemente de si la instalación lo define como UUID o texto.

insert into storage.buckets (id, name, public)
values
  ('profiles', 'profiles', true),
  ('stories', 'stories', true)
on conflict (id) do update set public = excluded.public;

-- Eliminar políticas anteriores que podían comparar owner_id con un tipo incorrecto.
drop policy if exists profiles_storage_insert_own on storage.objects;
drop policy if exists profiles_storage_update_own on storage.objects;
drop policy if exists profiles_storage_delete_own on storage.objects;
drop policy if exists stories_storage_insert_own on storage.objects;
drop policy if exists stories_storage_update_own on storage.objects;
drop policy if exists stories_storage_delete_own on storage.objects;

create policy profiles_storage_insert_own on storage.objects
for insert to authenticated
with check (
  bucket_id = 'profiles'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy profiles_storage_update_own on storage.objects
for update to authenticated
using (
  bucket_id = 'profiles'
  and owner_id::text = auth.uid()::text
)
with check (
  bucket_id = 'profiles'
  and owner_id::text = auth.uid()::text
);

create policy profiles_storage_delete_own on storage.objects
for delete to authenticated
using (
  bucket_id = 'profiles'
  and owner_id::text = auth.uid()::text
);

create policy stories_storage_insert_own on storage.objects
for insert to authenticated
with check (
  bucket_id = 'stories'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy stories_storage_update_own on storage.objects
for update to authenticated
using (
  bucket_id = 'stories'
  and owner_id::text = auth.uid()::text
)
with check (
  bucket_id = 'stories'
  and owner_id::text = auth.uid()::text
);

create policy stories_storage_delete_own on storage.objects
for delete to authenticated
using (
  bucket_id = 'stories'
  and owner_id::text = auth.uid()::text
);

-- Verificación útil: las URLs públicas deben comenzar por /storage/v1/object/public/.
-- No se agrega una política SELECT porque los buckets son públicos.
