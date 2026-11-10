-- 0044: bloqueo integral a nivel servidor.
-- La relación bloqueada es efectiva en ambos sentidos y no elimina datos existentes.

create or replace function public.is_blocked_between(p_left uuid, p_right uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_left is not null
    and p_right is not null
    and p_left <> p_right
    and exists (
      select 1
      from public.friendships f
      where f.status = 'blocked'
        and ((f.user_id = p_left and f.friend_id = p_right)
          or (f.user_id = p_right and f.friend_id = p_left))
    );
$$;
revoke all on function public.is_blocked_between(uuid, uuid) from public;
grant execute on function public.is_blocked_between(uuid, uuid) to authenticated, service_role;

-- RPCs que consultan perfiles mediante SECURITY DEFINER.
create or replace function public.search_public_profiles(p_query text)
returns table (id uuid, name text, username text, avatar_url text, cover_url text, bio text)
language sql stable security definer set search_path = public
as $$
  select p.id, p.name, p.username, p.avatar_url, p.cover_url, p.bio
  from public.profiles p
  where p.id <> auth.uid()
    and not public.is_blocked_between(auth.uid(), p.id)
    and coalesce(p.is_public, false) = true
    and length(trim(coalesce(p_query, ''))) >= 2
    and (
      lower(coalesce(p.username, '')) like '%' || lower(trim(p_query)) || '%'
      or lower(coalesce(p.name, '')) like '%' || lower(trim(p_query)) || '%'
      or lower(coalesce(p.email, '')) like '%' || lower(trim(p_query)) || '%'
    )
  order by lower(coalesce(p.name, p.username, ''))
  limit 25;
$$;
revoke all on function public.search_public_profiles(text) from public;
grant execute on function public.search_public_profiles(text) to authenticated;

-- 0004/0041 tienen dos firmas históricas; se reemplaza la firma vigente de 0041.
create or replace function public.get_visible_profiles(p_ids uuid[])
returns table (id uuid, name text, avatar_url text, cover_url text, bio text)
language sql stable security definer set search_path = public
as $$
  select p.id, p.name, p.avatar_url, p.cover_url, p.bio
  from public.profiles p
  where p.id = any(p_ids)
    and (
      p.id = auth.uid()
      or (not public.is_blocked_between(auth.uid(), p.id) and (
        coalesce(p.is_public, false) = true
        or exists (
          select 1 from public.friendships f
          where (f.status = 'accepted'
            and ((f.user_id = auth.uid() and f.friend_id = p.id)
              or (f.friend_id = auth.uid() and f.user_id = p.id)))
            or (f.status = 'pending' and f.friend_id = auth.uid() and f.user_id = p.id)
        )
      ))
    );
$$;
revoke all on function public.get_visible_profiles(uuid[]) from public;
grant execute on function public.get_visible_profiles(uuid[]) to authenticated;

create or replace function public.find_nearby_profiles(
  p_lat double precision, p_lng double precision, p_radius_km double precision default 5
)
returns table (id uuid, name text, email text, avatar_url text, cover_url text, distance_km double precision)
language sql stable security definer set search_path = public
as $$
  with candidates as (
    select p.id,
      coalesce(nullif(trim(p.name), ''), split_part(coalesce(p.email, ''), '@', 1)) as name,
      null::text as email, p.avatar_url, p.cover_url,
      6371.0 * acos(least(1.0, greatest(-1.0,
        cos(radians(p_lat)) * cos(radians(l.latitude)) * cos(radians(l.longitude) - radians(p_lng))
        + sin(radians(p_lat)) * sin(radians(l.latitude))))) as distance_km
    from public.profiles p
    join public.profile_locations l on l.user_id = p.id
    where p.id <> auth.uid()
      and not public.is_blocked_between(auth.uid(), p.id)
      and coalesce(p.is_public, false) = true
      and coalesce(p.discoverable_nearby, false) = true
      and coalesce(p.location_sharing, false) = true
      and l.updated_at > now() - interval '15 minutes'
  )
  select candidates.id, candidates.name, candidates.email, candidates.avatar_url, candidates.cover_url,
    round(candidates.distance_km::numeric, 1)::double precision
  from candidates
  where candidates.distance_km <= least(greatest(coalesce(p_radius_km, 5), 0.5), 10)
  order by candidates.distance_km asc limit 50;
$$;
revoke all on function public.find_nearby_profiles(double precision, double precision, double precision) from public;
grant execute on function public.find_nearby_profiles(double precision, double precision, double precision) to authenticated;

-- Historias, check-ins, reacciones y actividades nunca cruzan una relación bloqueada.
drop policy if exists stories_select_visible on public.stories;
create policy stories_select_visible on public.stories for select to authenticated
using (
  expires_at > now()
  and (user_id = auth.uid() or not public.is_blocked_between(auth.uid(), user_id))
  and (
    user_id = auth.uid() or privacy = 'public'
    or (privacy = 'all_friends' and exists (
      select 1 from public.friendships f where f.status = 'accepted'
      and ((f.user_id = auth.uid() and f.friend_id = stories.user_id)
        or (f.friend_id = auth.uid() and f.user_id = stories.user_id))))
    or (privacy = 'close_friends' and exists (
      select 1 from public.close_friends cf where cf.owner_id = stories.user_id and cf.friend_id = auth.uid()))
  )
);

drop policy if exists story_reactions_insert_policy on public.story_reactions;
create policy story_reactions_insert_policy on public.story_reactions
for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.stories s
    where s.id = story_id
      and s.expires_at > now()
      and s.user_id <> auth.uid()
      and not public.is_blocked_between(auth.uid(), s.user_id)
  )
);

drop policy if exists checkins_select_visible on public.checkins;
create policy checkins_select_visible on public.checkins for select to authenticated
using (
  user_id = auth.uid()
  or not public.is_blocked_between(auth.uid(), user_id)
  and exists (
    select 1 from public.friendships f where f.status = 'accepted'
      and ((f.user_id = auth.uid() and f.friend_id = checkins.user_id)
        or (f.friend_id = auth.uid() and f.user_id = checkins.user_id))
  )
);

create or replace function public.can_view_checkin(
  p_checkin_user uuid, p_viewer uuid, p_visibility text, p_excluded uuid[], p_allowed uuid[]
)
returns boolean language plpgsql stable security definer set search_path = public, auth
as $function$
begin
  if p_viewer is null or p_checkin_user = p_viewer
     or public.is_blocked_between(p_checkin_user, p_viewer) then return false; end if;
  if p_visibility = 'everyone' then return true; end if;
  if p_visibility = 'selected' then return p_viewer = any(coalesce(p_allowed, '{}')); end if;
  if p_visibility = 'friends_except' and p_viewer = any(coalesce(p_excluded, '{}')) then return false; end if;
  return exists (select 1 from public.friendships f where f.status = 'accepted'
    and ((f.user_id = p_checkin_user and f.friend_id = p_viewer)
      or (f.friend_id = p_checkin_user and f.user_id = p_viewer)));
end;
$function$;
revoke all on function public.can_view_checkin(uuid, uuid, text, uuid[], uuid[]) from public;
grant execute on function public.can_view_checkin(uuid, uuid, text, uuid[], uuid[]) to authenticated, service_role;

-- El RLS vigente de mensajes corta lectura y escritura; el trigger evita actividades residuales.
drop policy if exists direct_messages_select_participants on public.direct_messages;
create policy direct_messages_select_participants on public.direct_messages
for select to authenticated using (
  (sender_id = auth.uid() or recipient_id = auth.uid())
  and not public.is_blocked_between(sender_id, recipient_id)
);
drop policy if exists direct_messages_insert_sender on public.direct_messages;
create policy direct_messages_insert_sender on public.direct_messages
for insert to authenticated with check (
  sender_id = auth.uid() and sender_id <> recipient_id
  and not public.is_blocked_between(sender_id, recipient_id)
);

drop policy if exists activities_select_related on public.activities;
create policy activities_select_related on public.activities for select to authenticated
using (recipient_id = auth.uid() and not public.is_blocked_between(actor_id, recipient_id));

create or replace function public.create_activity_from_direct_message()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if public.is_blocked_between(new.sender_id, new.recipient_id) then return new; end if;
  insert into public.activities (recipient_id, actor_id, type, message)
  values (new.recipient_id, new.sender_id, 'direct_message', new.body);
  return new;
end;
$$;

create or replace function public.create_activity_from_story_reaction()
returns trigger language plpgsql security definer set search_path = public
as $$
declare owner_id uuid;
begin
  select s.user_id into owner_id from public.stories s where s.id = new.story_id;
  if owner_id is null or owner_id = new.user_id or public.is_blocked_between(new.user_id, owner_id) then return new; end if;
  insert into public.activities (recipient_id, actor_id, type, story_id, reaction_emoji, message)
  values (owner_id, new.user_id, 'reaction_story', new.story_id, new.emoji, 'reaccionó a tu Estado ' || new.emoji)
  on conflict (recipient_id, story_id, type, actor_id)
  do update set reaction_emoji = excluded.reaction_emoji, message = excluded.message, created_at = now(), read_at = null;
  return new;
end;
$$;

-- El trigger activo de 0005 invoca create_checkin_activity; se reemplaza esa
-- función para que la guarda no quede en una función sin trigger.
create or replace function public.create_checkin_activity()
returns trigger language plpgsql security definer set search_path = public
as $$
declare action_type text; venue_label text;
begin
  if tg_op = 'INSERT' and new.status = 'active' then action_type := 'check_in';
  elsif tg_op = 'UPDATE' and old.status = 'active' and new.status = 'ended' then action_type := 'check_out';
  else return new; end if;
  select coalesce(v.name, 'un lugar') into venue_label
  from public.venues v where v.id = new.venue_id;
  insert into public.activities (recipient_id, actor_id, type, checkin_id, venue_id, message)
  select case when f.user_id = new.user_id then f.friend_id else f.user_id end, new.user_id,
    action_type, new.id, new.venue_id,
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

notify pgrst, 'reload schema';
