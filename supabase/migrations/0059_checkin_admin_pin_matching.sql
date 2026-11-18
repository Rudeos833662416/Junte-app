-- 0059: los brindis usan únicamente pines administrados de venues.
-- Si no hay pin dentro del radio, el check-in queda sin venue y se notifica "cerca de tu zona".
alter table public.checkins
  alter column venue_id drop not null;

create or replace function public.find_pin_at_toast(
  p_lat double precision,
  p_lng double precision,
  p_radius_meters integer default 35
)
returns table (
  id bigint,
  name text,
  distance_meters double precision
)
language sql
stable
security definer
set search_path = public
as $$
  with candidates as (
    select
      v.id,
      v.name,
      6371000 * acos(least(1.0, greatest(-1.0,
        cos(radians(p_lat)) * cos(radians(v.latitude))
          * cos(radians(v.longitude) - radians(p_lng))
          + sin(radians(p_lat)) * sin(radians(v.latitude))
      ))) as distance_meters
    from public.venues v
    where coalesce(v.source, 'admin') <> 'device'
      and v.latitude is not null
      and v.longitude is not null
      and p_lat between -90 and 90
      and p_lng between -180 and 180
  )
  select candidates.id, candidates.name, candidates.distance_meters
  from candidates
  where candidates.distance_meters <= greatest(coalesce(p_radius_meters, 35), 1)
  order by candidates.distance_meters asc
  limit 1;
$$;

revoke all on function public.find_pin_at_toast(double precision, double precision, integer) from public;
grant execute on function public.find_pin_at_toast(double precision, double precision, integer) to authenticated;

create or replace function public.start_my_checkin(
  p_lat double precision,
  p_lng double precision,
  p_visibility text default 'friends',
  p_excluded_user_ids uuid[] default '{}',
  p_allowed_user_ids uuid[] default '{}'
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
  v_visibility text := coalesce(nullif(p_visibility, ''), 'friends');
begin
  if v_user_id is null then
    raise exception 'Debes iniciar sesión para brindar';
  end if;

  if p_lat is null or p_lng is null
     or p_lat < -90 or p_lat > 90
     or p_lng < -180 or p_lng > 180 then
    raise exception 'La ubicación GPS no es válida';
  end if;

  if v_visibility not in ('everyone', 'friends', 'friends_except', 'selected') then
    raise exception 'Audiencia de Brindar no válida';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));
  perform public.expire_stale_checkins();

  select c.id, c.venue_id, c.created_at, v.name
    into v_checkin_id, v_venue_id, v_created_at, v_venue_name
  from public.checkins c
  left join public.venues v on v.id = c.venue_id
  where c.user_id = v_user_id
    and c.status = 'active'
    and c.is_active = true
    and (c.expires_at is null or c.expires_at > now())
  order by c.created_at desc
  limit 1;

  if v_checkin_id is not null then
    update public.checkins
    set visibility = v_visibility,
        excluded_user_ids = case when v_visibility = 'friends_except' then coalesce(p_excluded_user_ids, '{}') else '{}' end,
        allowed_user_ids = case when v_visibility = 'selected' then coalesce(p_allowed_user_ids, '{}') else '{}' end
    where id = v_checkin_id;

    return jsonb_build_object(
      'id', v_checkin_id,
      'venue_id', v_venue_id,
      'venue_name', v_venue_name,
      'created_at', v_created_at
    );
  end if;

  select pin.id, pin.name
    into v_venue_id, v_venue_name
  from public.find_pin_at_toast(p_lat, p_lng, 35) pin;

  update public.checkins
     set status = 'ended', is_active = false, expires_at = least(coalesce(expires_at, now()), now())
   where user_id = v_user_id and status = 'active';

  insert into public.checkins (
    user_id, venue_id, status, is_active, expires_at, visibility, excluded_user_ids, allowed_user_ids
  ) values (
    v_user_id, v_venue_id, 'active', true, now() + interval '30 minutes', v_visibility,
    case when v_visibility = 'friends_except' then coalesce(p_excluded_user_ids, '{}') else '{}' end,
    case when v_visibility = 'selected' then coalesce(p_allowed_user_ids, '{}') else '{}' end
  )
  returning id, created_at into v_checkin_id, v_created_at;

  return jsonb_build_object(
    'id', v_checkin_id,
    'venue_id', v_venue_id,
    'venue_name', v_venue_name,
    'created_at', v_created_at
  );
exception
  when unique_violation then
    select c.id, c.venue_id, c.created_at, v.name
      into v_checkin_id, v_venue_id, v_created_at, v_venue_name
    from public.checkins c
    left join public.venues v on v.id = c.venue_id
    where c.user_id = v_user_id and c.status = 'active' and c.is_active = true
    order by c.created_at desc
    limit 1;

    if v_checkin_id is null then raise; end if;
    return jsonb_build_object(
      'id', v_checkin_id,
      'venue_id', v_venue_id,
      'venue_name', v_venue_name,
      'created_at', v_created_at
    );
end;
$$;

revoke all on function public.start_my_checkin(double precision, double precision, text, uuid[], uuid[]) from public;
grant execute on function public.start_my_checkin(double precision, double precision, text, uuid[], uuid[]) to authenticated;

create or replace function public.create_checkin_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  action_type text;
  venue_label text;
begin
  if tg_op = 'INSERT' and new.status = 'active' then action_type := 'check_in';
  elsif tg_op = 'UPDATE' and old.status = 'active' and new.status = 'ended' then action_type := 'check_out';
  else return new; end if;

  select coalesce(v.name, 'cerca de tu zona') into venue_label
  from public.venues v where v.id = new.venue_id;
  venue_label := coalesce(venue_label, 'cerca de tu zona');

  insert into public.activities (recipient_id, actor_id, type, checkin_id, venue_id, message)
  select case when f.user_id = new.user_id then f.friend_id else f.user_id end,
    new.user_id, action_type, new.id, new.venue_id,
    case when action_type = 'check_in' then 'está tomando algo en ' || venue_label
      else 'ha terminado su visita en ' || venue_label end
  from public.friendships f
  where f.status = 'accepted'
    and (f.user_id = new.user_id or f.friend_id = new.user_id)
    and case when f.user_id = new.user_id then f.friend_id else f.user_id end <> new.user_id
    and not public.is_blocked_between(new.user_id, case when f.user_id = new.user_id then f.friend_id else f.user_id end)
  on conflict (recipient_id, checkin_id, type) do nothing;
  return new;
end;
$$;

revoke all on function public.create_checkin_activity() from public;
