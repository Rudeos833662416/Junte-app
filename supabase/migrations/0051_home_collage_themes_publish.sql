-- 0051: drafts por tema y publicación atómica del collage.
-- Los drafts permanecen editables por admins; clientes normales solo leen publicados.

alter table public.home_collage_images
  add column if not exists theme text not null default 'light',
  add column if not exists is_published boolean not null default true,
  add column if not exists published_at timestamptz;

alter table public.home_collage_images drop constraint if exists home_collage_images_theme_check;
alter table public.home_collage_images add constraint home_collage_images_theme_check
  check (theme in ('light', 'dark'));
alter table public.home_collage_images drop constraint if exists home_collage_images_storage_path_key;

update public.home_collage_images
set theme = coalesce(theme, 'light'), is_published = coalesce(is_published, true)
where theme is null or is_published is null;

insert into public.home_collage_images
  (storage_path, image_url, alt_text, sort_order, is_active, created_by, theme, is_published, published_at)
select i.storage_path, i.image_url, i.alt_text, i.sort_order, i.is_active, i.created_by,
       'dark', true, now()
from public.home_collage_images i
where i.theme = 'light' and i.is_published = true
  and not exists (
    select 1 from public.home_collage_images existing
    where existing.storage_path = i.storage_path and existing.theme = 'dark' and existing.is_published = true
  );

insert into public.home_collage_images
  (storage_path, image_url, alt_text, sort_order, is_active, created_by, theme, is_published)
select i.storage_path, i.image_url, i.alt_text, i.sort_order, i.is_active, i.created_by,
       i.theme, false
from public.home_collage_images i
where i.is_published = true
  and not exists (
    select 1 from public.home_collage_images existing
    where existing.storage_path = i.storage_path and existing.theme = i.theme and existing.is_published = false
  );

create index if not exists home_collage_images_public_theme_idx
  on public.home_collage_images (theme, is_published, is_active, sort_order, created_at);

alter table public.home_collage_settings
  add column if not exists theme text not null default 'light',
  add column if not exists is_published boolean not null default true,
  add column if not exists published_at timestamptz;

alter table public.home_collage_settings drop constraint if exists home_collage_settings_singleton;
alter table public.home_collage_settings drop constraint if exists home_collage_settings_pkey;
alter table public.home_collage_settings drop constraint if exists home_collage_settings_theme_check;
alter table public.home_collage_settings add constraint home_collage_settings_theme_check
  check (theme in ('light', 'dark'));
create unique index if not exists home_collage_settings_theme_publish_uidx
  on public.home_collage_settings (theme, is_published);

update public.home_collage_settings set theme = 'light', is_published = true where id = true and theme = 'light';
insert into public.home_collage_settings
  (id, image_opacity, brightness, contrast, overlay_color, overlay_opacity, fade_duration_ms, hold_duration_ms, transition_type, shuffle_enabled, autoplay_enabled, theme, is_published, published_at)
select true, image_opacity, brightness, contrast, overlay_color, overlay_opacity, fade_duration_ms, hold_duration_ms, transition_type, shuffle_enabled, autoplay_enabled, 'dark', true, now()
from public.home_collage_settings s
where s.theme = 'light' and s.is_published = true
  and not exists (select 1 from public.home_collage_settings x where x.theme = 'dark' and x.is_published = true);
insert into public.home_collage_settings
  (id, image_opacity, brightness, contrast, overlay_color, overlay_opacity, fade_duration_ms, hold_duration_ms, transition_type, shuffle_enabled, autoplay_enabled, theme, is_published)
select true, image_opacity, brightness, contrast, overlay_color, overlay_opacity, fade_duration_ms, hold_duration_ms, transition_type, shuffle_enabled, autoplay_enabled, theme, false
from public.home_collage_settings s
where s.is_published = true
  and not exists (select 1 from public.home_collage_settings x where x.theme = s.theme and x.is_published = false);

create or replace function public.publish_home_collage(p_theme text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin boolean;
begin
  if p_theme not in ('light', 'dark') then
    raise exception 'invalid collage theme';
  end if;
  select public.is_admin() into v_admin;
  if not coalesce(v_admin, false) then
    raise exception 'admin role required';
  end if;

  delete from public.home_collage_images where theme = p_theme and is_published = true;
  update public.home_collage_images
    set is_published = true, published_at = now()
    where theme = p_theme and is_published = false;
  insert into public.home_collage_images
    (storage_path, image_url, alt_text, sort_order, is_active, created_by, theme, is_published, published_at)
  select storage_path, image_url, alt_text, sort_order, is_active, created_by, theme, false, null
  from public.home_collage_images
  where theme = p_theme and is_published = true;

  delete from public.home_collage_settings where theme = p_theme and is_published = true;
  update public.home_collage_settings
    set is_published = true, published_at = now()
    where theme = p_theme and is_published = false;
  insert into public.home_collage_settings
    (id, image_opacity, brightness, contrast, overlay_color, overlay_opacity, fade_duration_ms, hold_duration_ms, transition_type, shuffle_enabled, autoplay_enabled, theme, is_published, published_at)
  select true, image_opacity, brightness, contrast, overlay_color, overlay_opacity, fade_duration_ms, hold_duration_ms, transition_type, shuffle_enabled, autoplay_enabled, theme, false, null
  from public.home_collage_settings
  where theme = p_theme and is_published = true;
end;
$$;

revoke all on function public.publish_home_collage(text) from public;
grant execute on function public.publish_home_collage(text) to authenticated;

alter table public.home_collage_images enable row level security;
drop policy if exists home_collage_images_select_active on public.home_collage_images;
create policy home_collage_images_select_published on public.home_collage_images
  for select to anon, authenticated
  using (is_published = true and is_active = true or public.is_admin());

drop policy if exists home_collage_images_insert_admin on public.home_collage_images;
create policy home_collage_images_insert_admin on public.home_collage_images
  for insert to authenticated with check (public.is_admin() and created_by = auth.uid());
drop policy if exists home_collage_images_update_admin on public.home_collage_images;
create policy home_collage_images_update_admin on public.home_collage_images
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists home_collage_images_delete_admin on public.home_collage_images;
create policy home_collage_images_delete_admin on public.home_collage_images
  for delete to authenticated using (public.is_admin());

alter table public.home_collage_settings enable row level security;
drop policy if exists home_collage_settings_select on public.home_collage_settings;
create policy home_collage_settings_select_published on public.home_collage_settings
  for select to anon, authenticated using (is_published = true or public.is_admin());
drop policy if exists home_collage_settings_update_admin on public.home_collage_settings;
create policy home_collage_settings_update_admin on public.home_collage_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public.home_collage_images replica identity full;
alter table public.home_collage_settings replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'home_collage_images') then
    alter publication supabase_realtime add table public.home_collage_images;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'home_collage_settings') then
    alter publication supabase_realtime add table public.home_collage_settings;
  end if;
end;
$$;
