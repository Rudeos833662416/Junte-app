-- Mantiene la ubicación en venue_id para el mapa, pero no la incluye en el texto visible.
create or replace function public.create_activity_from_checkin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  action_type text;
begin
  if tg_op = 'INSERT' then
    action_type := 'check_in';
  elsif old.status = 'active' and new.status = 'ended' then
    action_type := 'check_out';
  else
    return new;
  end if;

  insert into public.activities (recipient_id, actor_id, type, checkin_id, venue_id, message)
  select
    case when f.user_id = new.user_id then f.friend_id else f.user_id end,
    new.user_id,
    action_type,
    new.id,
    new.venue_id,
    case when action_type = 'check_in'
      then 'está tomando algo'
      else 'ha terminado su visita'
    end
  from public.friendships f
  where f.status = 'accepted'
    and (f.user_id = new.user_id or f.friend_id = new.user_id)
  on conflict (recipient_id, checkin_id, type) do nothing;

  return new;
end;
$$;
