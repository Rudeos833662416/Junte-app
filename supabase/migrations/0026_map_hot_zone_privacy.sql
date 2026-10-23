-- Tragos Sociales: zona caliente agregada y marcadores privados del mapa.
-- El contador incluye todos los brindis activos cercanos; los marcadores individuales
-- solo incluyen amistades aceptadas o perfiles públicos.

create or replace function public.get_map_activity()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  activity_count integer := 0;
  center_lat double precision;
  center_lng double precision;
  visible_markers jsonb := '[]'::jsonb;
begin
  select count(*)::integer,
         round(avg(v.latitude)::numeric, 3)::double precision,
         round(avg(v.longitude)::numeric, 3)::double precision
    into activity_count, center_lat, center_lng
    from public.checkins c
    join public.venues v on v.id = c.venue_id
   where c.status = 'active'
     and c.user_id <> auth.uid()
     and v.latitude is not null
     and v.longitude is not null;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'user_id', c.user_id,
    'name', coalesce(nullif(trim(p.name), ''), nullif(trim(p.username), ''), 'Amigo'),
    'venue_name', v.name,
    'latitude', v.latitude,
    'longitude', v.longitude,
    'created_at', c.created_at
  ) order by c.created_at desc), '[]'::jsonb)
    into visible_markers
    from public.checkins c
    join public.venues v on v.id = c.venue_id
    join public.profiles p on p.id = c.user_id
   where c.status = 'active'
     and c.user_id <> auth.uid()
     and v.latitude is not null
     and v.longitude is not null
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
    'center_latitude', center_lat,
    'center_longitude', center_lng,
    'markers', visible_markers
  );
end;
$$;

revoke all on function public.get_map_activity() from public;
grant execute on function public.get_map_activity() to authenticated;

notify pgrst, 'reload schema';
