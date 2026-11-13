-- 0049: configuración administrable del collage de Home.
create table if not exists public.home_collage_settings (
  id boolean primary key default true,
  image_opacity numeric not null default 0.16,
  brightness numeric not null default 0,
  contrast numeric not null default 0.08,
  overlay_color text not null default '#FFF1D0',
  overlay_opacity numeric not null default 0.12,
  fade_duration_ms integer not null default 2300,
  hold_duration_ms integer not null default 6500,
  transition_type text not null default 'crossfade',
  shuffle_enabled boolean not null default false,
  autoplay_enabled boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint home_collage_settings_singleton check (id = true),
  constraint home_collage_settings_opacity_check check (image_opacity between 0 and 1),
  constraint home_collage_settings_brightness_check check (brightness between -0.35 and 0.35),
  constraint home_collage_settings_contrast_check check (contrast between 0 and 0.5),
  constraint home_collage_settings_overlay_opacity_check check (overlay_opacity between 0 and 0.75),
  constraint home_collage_settings_fade_check check (fade_duration_ms between 800 and 5000),
  constraint home_collage_settings_hold_check check (hold_duration_ms between 3000 and 30000),
  constraint home_collage_settings_transition_check check (transition_type in ('crossfade', 'instant')),
  constraint home_collage_settings_color_check check (overlay_color ~ '^#[0-9A-Fa-f]{6}$')
);

insert into public.home_collage_settings (id)
values (true)
on conflict (id) do nothing;

alter table public.home_collage_settings enable row level security;
drop policy if exists home_collage_settings_select on public.home_collage_settings;
create policy home_collage_settings_select
  on public.home_collage_settings for select to anon, authenticated using (true);
drop policy if exists home_collage_settings_update_admin on public.home_collage_settings;
create policy home_collage_settings_update_admin
  on public.home_collage_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop trigger if exists home_collage_settings_updated_at on public.home_collage_settings;
create trigger home_collage_settings_updated_at
before update on public.home_collage_settings
for each row execute function public.set_home_collage_images_updated_at();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'home_collage_settings'
  ) then
    alter publication supabase_realtime add table public.home_collage_settings;
  end if;
end;
$$;

alter table public.home_collage_settings replica identity full;
