-- Tragos Sociales: Brindis Activo con TTL de 30 minutos y zona caliente por densidad.
-- Ejecutar después de la migración 0026.

alter table public.checkins
  add column if not exists is_active boolean not null default true;

alter table public.checkins
  alter column expires_at set default (now() + interval '30 minutes');

update public.checkins
   set is_active = false
 where status <> 'active'
    or (expires_at is not null and expires_at <= now());

update public.checkins
   set expires_at = created_at + interval '30 minutes'
 where status = 'active'
   and is_active = true
   and expires_at is null;

create index if not exists checkins_active_ttl_idx
  on public.checkins (status, is_active, expires_at, venue_id)
  where status = 'active' and is_active = true;

create or replace function public.expire_stale_checkins()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer;
begin
  update public.checkins
     set is_active = false,
         status = 'ended'
   where status = 'active'
     and is_active = true
     and expires_at is not null
     and expires_at <= now();
  get diagnostics changed = row_count;
  return changed;
end;
$$;

grant execute on function public.expire_stale_checkins() to authenticated;

drop function if exists public.deactivate_my_checkin(bigint);
create function public.deactivate_my_checkin(p_checkin_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  changed boolean;
begin
  update public.checkins
     set is_active = false,
         status = 'ended',
         expires_at = least(coalesce(expires_at, now()), now())
   where id = p_checkin_id
     and user_id = auth.uid()
     and status = 'active';
  changed := found;
  return changed;
end;
$$;

grant execute on function public.deactivate_my_checkin(bigint) to authenticated;

create or replace function public.get_map_activity()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  cluster_venue_id bigint;
  cluster_lat double precision;
  cluster_lng double precision;
  activity_count integer := 0;
  visible_markers jsonb := '[]'::jsonb;
begin
  perform public.expire_stale_checkins();

  -- Cada local geocodificado funciona como geofence de 50 metros.
  -- Se elige el grupo más concurrido y no se mezclan locales distantes.
  select
    v.id,
    v.latitude,
    v.longitude,
    count(*)::integer
  into cluster_venue_id, cluster_lat, cluster_lng, activity_count
  from public.checkins c
  join public.venues v on v.id = c.venue_id
  where c.status = 'active'
    and c.is_active = true
    and c.expires_at > now()
    and c.user_id <> auth.uid()
    and v.latitude is not null
    and v.longitude is not null
  group by v.id, v.latitude, v.longitude
  having count(*) >= 3
  order by count(*) desc, max(c.created_at) desc
  limit 1;

  if cluster_venue_id is null then
    return jsonb_build_object(
      'total_count', 0,
      'center_latitude', null,
      'center_longitude', null,
      'markers', '[]'::jsonb
    );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'user_id', c.user_id,
        'name', coalesce(nullif(trim(p.name), ''), nullif(trim(p.username), ''), 'Amigo'),
        'venue_name', v.name,
        'latitude', v.latitude,
        'longitude', v.longitude,
        'created_at', c.created_at
      ) order by c.created_at desc
    ),
    '[]'::jsonb
  )
  into visible_markers
  from public.checkins c
  join public.venues v on v.id = c.venue_id
  join public.profiles p on p.id = c.user_id
  where c.venue_id = cluster_venue_id
    and c.status = 'active'
    and c.is_active = true
    and c.expires_at > now()
    and c.user_id <> auth.uid()
    and (
      coalesce(p.is_public, false) = true
      or exists (
        select 1
        from public.friendships f
        where f.status = 'accepted'
          and ((f.user_id = auth.uid() and f.friend_id = c.user_id)
            or (f.friend_id = auth.uid() and f.user_id = c.user_id))
      )
    );

  return jsonb_build_object(
    'total_count', activity_count,
    'center_latitude', cluster_lat,
    'center_longitude', cluster_lng,
    'markers', visible_markers
  );
end;
$$;

revoke all on function public.get_map_activity() from public;
grant execute on function public.get_map_activity() to authenticated;

notify pgrst, 'reload schema';
