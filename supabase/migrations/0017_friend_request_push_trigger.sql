-- Vincular cada actividad de solicitud con su fila de amistad.
alter table public.activities
add column if not exists friendship_id bigint references public.friendships(id) on delete cascade;

create index if not exists activities_friendship_idx
on public.activities (friendship_id);

-- Crear una actividad para el destinatario cuando llega una solicitud de amistad.
create or replace function public.create_activity_from_friend_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'pending' then
    return new;
  end if;

  insert into public.activities (
    recipient_id,
    actor_id,
    type,
    friendship_id,
    checkin_id,
    venue_id,
    message
  )
  values (
    new.friend_id,
    new.user_id,
    'friend_request',
    new.id,
    null,
    null,
    'te envió una solicitud de amistad'
  );
  return new;
end;
$$;

drop trigger if exists friendships_friend_request_activity on public.friendships;
create trigger friendships_friend_request_activity
after insert on public.friendships
for each row execute function public.create_activity_from_friend_request();
