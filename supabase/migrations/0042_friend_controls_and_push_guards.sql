-- 0042: controles de amistad y guardas de push
-- Permite eliminar una amistad, bloquear a un usuario y evita nuevas solicitudes
-- contra una relación bloqueada. Mantiene la audiencia de brindis en el backend.

alter table public.friendships enable row level security;

drop policy if exists friendships_delete_related on public.friendships;
create policy friendships_delete_related on public.friendships
for delete to authenticated
using (user_id = auth.uid() or friend_id = auth.uid());

grant delete on table public.friendships to authenticated;

create or replace function public.prevent_request_to_blocked_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'pending' and exists (
    select 1
      from public.friendships f
     where f.status = 'blocked'
       and ((f.user_id = new.user_id and f.friend_id = new.friend_id)
         or (f.user_id = new.friend_id and f.friend_id = new.user_id))
  ) then
    raise exception 'friendship_blocked' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists friendships_blocked_request_guard on public.friendships;
create trigger friendships_blocked_request_guard
before insert or update of user_id, friend_id, status on public.friendships
for each row execute function public.prevent_request_to_blocked_user();

-- Defensa adicional: nunca crear actividades de brindis para el propio autor.
create or replace function public.create_activity_from_checkin_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  action_type text;
begin
  if tg_op = 'INSERT' and new.status = 'active' then
    action_type := 'check_in';
  elsif tg_op = 'UPDATE' and old.status = 'active' and new.status = 'ended' then
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
    case when action_type = 'check_in' then 'está tomando algo' else 'ha terminado su visita' end
  from public.friendships f
  where f.status = 'accepted'
    and (f.user_id = new.user_id or f.friend_id = new.user_id)
    and case when f.user_id = new.user_id then f.friend_id else f.user_id end <> new.user_id
  on conflict (recipient_id, checkin_id, type) do nothing;

  return new;
end;
$$;

notify pgrst, 'reload schema';
