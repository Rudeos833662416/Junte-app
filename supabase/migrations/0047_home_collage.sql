-- 0047: imágenes administrables del collage de Home de Junta2.
-- Copiar y ejecutar en Supabase SQL Editor con un rol con permisos de DDL.

create table if not exists public.home_collage_images (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  image_url text not null,
  alt_text text not null default 'Imagen decorativa de Junta2',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint home_collage_images_sort_order_check check (sort_order >= 0),
  constraint home_collage_images_storage_path_check check (storage_path like 'home-collage/%')
);

create index if not exists home_collage_images_active_order_idx
  on public.home_collage_images (is_active, sort_order, created_at);

alter table public.home_collage_images enable row level security;

drop policy if exists home_collage_images_select_active on public.home_collage_images;
create policy home_collage_images_select_active
  on public.home_collage_images
  for select to anon, authenticated
  using (is_active = true or public.is_admin());

drop policy if exists home_collage_images_insert_admin on public.home_collage_images;
create policy home_collage_images_insert_admin
  on public.home_collage_images
  for insert to authenticated
  with check (created_by = auth.uid() and public.is_admin());

drop policy if exists home_collage_images_update_admin on public.home_collage_images;
create policy home_collage_images_update_admin
  on public.home_collage_images
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists home_collage_images_delete_admin on public.home_collage_images;
create policy home_collage_images_delete_admin
  on public.home_collage_images
  for delete to authenticated
  using (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('home-collage', 'home-collage', true, 8 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp']::text[])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists home_collage_storage_read on storage.objects;
create policy home_collage_storage_read
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'home-collage');

drop policy if exists home_collage_storage_insert_admin on storage.objects;
create policy home_collage_storage_insert_admin
  on storage.objects for insert to authenticated
  with check (bucket_id = 'home-collage' and public.is_admin() and (storage.foldername(name))[1] = 'home-collage');

drop policy if exists home_collage_storage_update_admin on storage.objects;
create policy home_collage_storage_update_admin
  on storage.objects for update to authenticated
  using (bucket_id = 'home-collage' and public.is_admin())
  with check (bucket_id = 'home-collage' and public.is_admin());

drop policy if exists home_collage_storage_delete_admin on storage.objects;
create policy home_collage_storage_delete_admin
  on storage.objects for delete to authenticated
  using (bucket_id = 'home-collage' and public.is_admin());

create or replace function public.set_home_collage_images_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists home_collage_images_updated_at on public.home_collage_images;
create trigger home_collage_images_updated_at
before update on public.home_collage_images
for each row execute function public.set_home_collage_images_updated_at();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'home_collage_images'
  ) then
    alter publication supabase_realtime add table public.home_collage_images;
  end if;
end;
$$;

alter table public.home_collage_images replica identity full;
