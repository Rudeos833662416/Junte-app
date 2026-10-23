-- Sky Night: privacidad de perfil, descubrimiento cercano y ciclo de vida de Historias

alter table if exists public.profiles
  add column if not exists is_public boolean not null default false,
  add column if not exists discoverable_nearby boolean not null default false,
  add column if not exists location_sharing boolean not null default true;

alter table if exists public.friendships
  add column if not exists request_message text;

alter table if exists public.stories
  add column if not exists music_source text,
  add column if not exists music_license_url text;

create table if not exists public.profile_locations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  updated_at timestamptz not null default now()
);

create index if not exists profile_locations_updated_idx
  on public.profile_locations (updated_at desc);

alter table public.profile_locations enable row level security;
drop policy if exists profile_locations_select_own on public.profile_locations;
create policy profile_locations_select_own on public.profile_locations
for select to authenticated using (user_id = auth.uid());
drop policy if exists profile_locations_insert_own on public.profile_locations;
create policy profile_locations_insert_own on public.profile_locations
for insert to authenticated with check (user_id = auth.uid());
drop policy if exists profile_locations_update_own on public.profile_locations;
create policy profile_locations_update_own on public.profile_locations
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists profile_locations_delete_own on public.profile_locations;
create policy profile_locations_delete_own on public.profile_locations
for delete to authenticated using (user_id = auth.uid());

-- El perfil completo, incluido el correo, solo lo puede leer su propio dueño.
drop policy if exists profiles_select_authenticated on public.profiles;
drop policy if exists profiles_select_public on public.profiles;
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
for select to authenticated
using (id = auth.uid());

-- La vista pública nunca expone correo ni coordenadas.
drop view if exists public.public_profiles;
create view public.public_profiles as
select id, name, avatar_url, cover_url
from public.profiles
where coalesce(is_public, false) = true;
grant select on public.public_profiles to authenticated;

create or replace function public.get_visible_profiles(p_ids uuid[])
returns table (
  id uuid,
  name text,
  avatar_url text,
  cover_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.name, p.avatar_url, p.cover_url
  from public.profiles p
  where p.id = any(p_ids)
    and (
      p.id = auth.uid()
      or coalesce(p.is_public, false) = true
      or exists (
        select 1 from public.friendships f
        where (f.status = 'accepted'
          and ((f.user_id = auth.uid() and f.friend_id = p.id)
            or (f.friend_id = auth.uid() and f.user_id = p.id)))
          or (f.status = 'pending' and f.friend_id = auth.uid() and f.user_id = p.id)
      )
    );
$$;

revoke all on function public.get_visible_profiles(uuid[]) from public;
grant execute on function public.get_visible_profiles(uuid[]) to authenticated;

-- Las Historias vencidas dejan de ser visibles aunque la limpieza física todavía no se haya ejecutado.
drop policy if exists stories_select_visible on public.stories;
create policy stories_select_visible on public.stories for select to authenticated
using (
  expires_at > now()
  and (
    user_id = auth.uid()
    or visibility = 'public'
    or (
      visibility = 'friends'
      and exists (
        select 1 from public.friendships f
        where f.status = 'accepted'
          and ((f.user_id = auth.uid() and f.friend_id = stories.user_id)
            or (f.friend_id = auth.uid() and f.user_id = stories.user_id))
      )
    )
  )
);

create or replace function public.purge_expired_stories()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.stories where expires_at <= now();
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.purge_expired_stories() from public;
grant execute on function public.purge_expired_stories() to authenticated;

create or replace function public.find_nearby_profiles(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 5
)
returns table (
  id uuid,
  name text,
  email text,
  avatar_url text,
  cover_url text,
  distance_km double precision
)
language sql
stable
security definer
set search_path = public
as $$
  with candidates as (
    select
      p.id,
      coalesce(nullif(trim(p.name), ''), split_part(coalesce(p.email, ''), '@', 1)) as name,
      null::text as email,
      p.avatar_url,
      p.cover_url,
      6371.0 * acos(
        least(1.0, greatest(-1.0,
          cos(radians(p_lat)) * cos(radians(l.latitude)) * cos(radians(l.longitude) - radians(p_lng))
          + sin(radians(p_lat)) * sin(radians(l.latitude))
        ))
      ) as distance_km
    from public.profiles p
    join public.profile_locations l on l.user_id = p.id
    where p.id <> auth.uid()
      and coalesce(p.is_public, false) = true
      and coalesce(p.discoverable_nearby, false) = true
      and coalesce(p.location_sharing, false) = true
      and l.updated_at > now() - interval '15 minutes'
  )
  select
    candidates.id,
    candidates.name,
    candidates.email,
    candidates.avatar_url,
    candidates.cover_url,
    round(candidates.distance_km::numeric, 1)::double precision
  from candidates
  where candidates.distance_km <= least(greatest(coalesce(p_radius_km, 5), 0.5), 10)
  order by candidates.distance_km asc
  limit 50;
$$;

revoke all on function public.find_nearby_profiles(double precision, double precision, double precision) from public;
grant execute on function public.find_nearby_profiles(double precision, double precision, double precision) to authenticated;
