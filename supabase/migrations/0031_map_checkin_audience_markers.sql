-- 0031: privacidad de mapa (can_view_checkin + get_map_activity)
-- Alineado con producción: marcadores individuales aunque no haya zona caliente.

create or replace function public.can_view_checkin(
  p_checkin_user uuid,
  p_viewer uuid,
  p_visibility text,
  p_excluded uuid[],
  p_allowed uuid[]
)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public', 'auth'
as $function$
begin
  if p_viewer is null or p_checkin_user = p_viewer then
    return false;
  end if;

  if p_visibility = 'everyone' then
    return true;
  end if;

  if p_visibility = 'selected' then
    return p_viewer = any(coalesce(p_allowed, '{}'));
  end if;

  if p_visibility = 'friends_except'
     and p_viewer = any(coalesce(p_excluded, '{}')) then
    return false;
  end if;

  return exists (
    select 1
    from public.friendships f
    where f.status = 'accepted'
      and (
        (f.user_id = p_checkin_user and f.friend_id = p_viewer)
        or
        (f.friend_id = p_checkin_user and f.user_id = p_viewer)
      )
  );
end;
$function$;

create or replace function public.get_map_activity()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_hot_count integer := 0;
  v_hot_radius integer := 50;
  v_total_count integer := 0;
  v_markers jsonb := '[]'::jsonb;
  v_center_lat double precision;
  v_center_lng double precision;
begin
  perform public.expire_stale_checkins();

  with visible as (
    select c.id, c.user_id, c.created_at, c.visibility,
           c.excluded_user_ids, c.allowed_user_ids,
           v.latitude, v.longitude, v.geo_point
      from public.checkins c
      join public.venues v on v.id = c.venue_id
     where c.status = 'active'
       and c.is_active = true
       and (c.expires_at is null or c.expires_at > now())
       and v.latitude is not null
       and v.longitude is not null
       and public.can_view_checkin(
         c.user_id,
         auth.uid(),
         coalesce(c.visibility, 'friends'),
         coalesce(c.excluded_user_ids, '{}'),
         coalesce(c.allowed_user_ids, '{}')
       )
  ), clusters as (
    select avg(a.latitude) as center_lat,
           avg(a.longitude) as center_lng,
           count(*)::integer as cluster_count
      from visible a
      join visible b on a.geo_point is not null
                      and b.geo_point is not null
                      and st_dwithin(a.geo_point, b.geo_point, 50)
     group by a.id
     order by count(*) desc, max(a.created_at) desc
     limit 1
  )
  select center_lat, center_lng, cluster_count
    into v_center_lat, v_center_lng, v_hot_count
    from clusters;

  -- Menos de tres personas no forma zona caliente, pero sus marcadores
  -- individuales siguen siendo visibles si la audiencia lo permite.
  if v_center_lat is null or v_hot_count < 3 then
    v_hot_count := 0;
    v_center_lat := null;
    v_center_lng := null;
  elsif v_hot_count >= 12 then
    v_hot_radius := 150;
  elsif v_hot_count >= 6 then
    v_hot_radius := 100;
  end if;

  with visible as (
    select c.id, c.user_id, c.created_at, v.name as venue_name,
           v.latitude, v.longitude
      from public.checkins c
      join public.venues v on v.id = c.venue_id
     where c.status = 'active'
       and c.is_active = true
       and (c.expires_at is null or c.expires_at > now())
       and v.latitude is not null
       and v.longitude is not null
       and public.can_view_checkin(
         c.user_id,
         auth.uid(),
         coalesce(c.visibility, 'friends'),
         coalesce(c.excluded_user_ids, '{}'),
         coalesce(c.allowed_user_ids, '{}')
       )
  )
  select count(*)::integer
    into v_total_count
    from visible;

  with visible as (
    select c.id, c.user_id, c.created_at,
           coalesce(v.name, 'Lugar compartido') as venue_name,
           v.latitude, v.longitude
      from public.checkins c
      join public.venues v on v.id = c.venue_id
     where c.status = 'active'
       and c.is_active = true
       and (c.expires_at is null or c.expires_at > now())
       and v.latitude is not null
       and v.longitude is not null
       and public.can_view_checkin(
         c.user_id,
         auth.uid(),
         coalesce(c.visibility, 'friends'),
         coalesce(c.excluded_user_ids, '{}'),
         coalesce(c.allowed_user_ids, '{}')
       )
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', visible.id,
    'user_id', visible.user_id,
    'name', coalesce(nullif(trim(p.name), ''), nullif(trim(p.username), ''), 'Amigo'),
    'venue_name', visible.venue_name,
    'latitude', visible.latitude,
    'longitude', visible.longitude,
    'created_at', visible.created_at
  ) order by visible.created_at desc), '[]'::jsonb)
    into v_markers
    from visible
    join public.profiles p on p.id = visible.user_id;

  return jsonb_build_object(
    'total_count', v_total_count,
    'hot_zone_count', v_hot_count,
    'hot_zone_radius', v_hot_radius,
    'center_latitude', v_center_lat,
    'center_longitude', v_center_lng,
    'markers', v_markers
  );
end;
$function$;

grant execute on function public.can_view_checkin(uuid, uuid, text, uuid[], uuid[]) to authenticated, service_role;
grant execute on function public.get_map_activity() to authenticated, service_role;
