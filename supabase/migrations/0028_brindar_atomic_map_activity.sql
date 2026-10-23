-- Tragos Sociales: Brindar atómico y mapa en tiempo real por proximidad.
-- Ejecutar después de la migración 0027.

create or replace function public.start_my_checkin(
  p_lat double precision,
  p_lng double precision
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_venue_id bigint;
  v_venue_name text;
  v_checkin_id bigint;
  v_created_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Debes iniciar sesión para brindar';
  end if;

  if p_lat is null or p_lng is null
     or p_lat < -90 or p_lat > 90
     or p_lng < -180 or p_lng > 180 then
    raise exception 'La ubicación GPS no es válida';
  end if;

  -- Evita dos toques simultáneos que creen dos brindis para la misma cuenta.
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));
  perform public.expire_stale_checkins();

  -- Reutiliza un venue GPS cercano para no llenar venues con duplicados.
  select v.id, v.name
    into v_venue_id, v_venue_name
  from public.venues v
  where v.source = 'device'
    and v.latitude is not null
    and v.longitude is not null
    and ((v.latitude - p_lat) * (v.latitude - p_lat)
      + (v.longitude - p_lng) * (v.longitude - p_lng)) < 0.000001
  order by ((v.latitude - p_lat) * (v.latitude - p_lat)
      + (v.longitude - p_lng) * (v.longitude - p_lng)) asc
  limit 1;

  if v_venue_id is null then
    insert into public.venues (
      name, address, city, country, latitude, longitude, source, source_id
    ) values (
      'Ubicación GPS actual', 'Ubicación GPS actual', null, 'Venezuela',
      p_lat, p_lng, 'device', null
    )
    returning id, name into v_venue_id, v_venue_name;
  end if;

  update public.checkins
     set status = 'ended',
         is_active = false,
         expires_at = least(coalesce(expires_at, now()), now())
   where user_id = v_user_id
     and status = 'active';

  insert into public.checkins (
    user_id, venue_id, status, is_active, expires_at
  ) values (
    v_user_id, v_venue_id, 'active', true, now() + interval '30 minutes'
  )
  returning id, created_at into v_checkin_id, v_created_at;

  return jsonb_build_object(
    'id', v_checkin_id,
    'venue_id', v_venue_id,
    'venue_name', coalesce(v_venue_name, 'Ubicación GPS actual'),
    'created_at', v_created_at
  );
end;
$$;

revoke all on function public.start_my_checkin(double precision, double precision) from public;
grant execute on function public.start_my_checkin(double precision, double precision) to authenticated;

create or replace function public.get_map_activity()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  v_total_count integer := 0;
  v_hot_count integer := 0;
  v_hot_lat double precision;
  v_hot_lng double precision;
  v_hot_radius integer := 50;
  v_markers jsonb := '[]'::jsonb;
begin
  perform public.expire_stale_checkins();

  -- Total de brindis activos de terceros; los perfiles privados solo cuentan.
  select count(*)::integer
    into v_total_count
  from public.checkins c
  where c.status = 'active'
    and c.is_active = true
    and c.expires_at > now()
    and c.user_id <> auth.uid();

  -- Busca grupos reales dentro de 50 m, aunque cada GPS tenga un venue distinto.
  with active as (
    select c.id, v.latitude, v.longitude
    from public.checkins c
    join public.venues v on v.id = c.venue_id
    where c.status = 'active'
      and c.is_active = true
      and c.expires_at > now()
      and c.user_id <> auth.uid()
      and v.latitude is not null
      and v.longitude is not null
  ), clusters as (
    select a.id,
           count(b.id)::integer as cluster_count,
           avg(b.latitude) as center_lat,
           avg(b.longitude) as center_lng
    from active a
    join active b on (
      6371000 * 2 * asin(sqrt(
        power(sin(radians(b.latitude - a.latitude) / 2), 2) +
        cos(radians(a.latitude)) * cos(radians(b.latitude)) *
        power(sin(radians(b.longitude - a.longitude) / 2), 2)
      )) <= 50
    )
    group by a.id
    having count(b.id) >= 3
    order by count(b.id) desc, a.id
    limit 1
  )
  select cluster_count, center_lat, center_lng
    into v_hot_count, v_hot_lat, v_hot_lng
  from clusters;

  if v_hot_count >= 12 then
    v_hot_radius := 150;
  elsif v_hot_count >= 6 then
    v_hot_radius := 100;
  else
    v_hot_radius := 50;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'user_id', c.user_id,
    'name', coalesce(nullif(trim(p.name), ''), nullif(trim(p.username), ''), 'Amigo'),
    'venue_name', v.name,
    'latitude', v.latitude,
    'longitude', v.longitude,
    'created_at', c.created_at
  ) order by c.created_at desc), '[]'::jsonb)
    into v_markers
  from public.checkins c
  join public.venues v on v.id = c.venue_id
  join public.profiles p on p.id = c.user_id
  where c.status = 'active'
    and c.is_active = true
    and c.expires_at > now()
    and c.user_id <> auth.uid()
    and v.latitude is not null
    and v.longitude is not null
    and (
      coalesce(p.is_public, false) = true
      or exists (
        select 1 from public.friendships f
        where f.status = 'accepted'
          and ((f.user_id = auth.uid() and f.friend_id = c.user_id)
            or (f.friend_id = auth.uid() and f.user_id = c.user_id))
      )
    );

  return jsonb_build_object(
    'total_count', v_total_count,
    'hot_zone_count', coalesce(v_hot_count, 0),
    'hot_zone_radius', v_hot_radius,
    'center_latitude', v_hot_lat,
    'center_longitude', v_hot_lng,
    'markers', v_markers
  );
end;
$$;

revoke all on function public.get_map_activity() from public;
grant execute on function public.get_map_activity() to authenticated;

notify pgrst, 'reload schema';
