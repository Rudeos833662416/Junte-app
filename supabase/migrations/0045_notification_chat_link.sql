-- 0045: contrato de navegación y acciones para notificaciones de chat
-- La actividad debe conservar el UUID del mensaje para abrir el chat y marcarlo leído.

create or replace function public.create_activity_from_direct_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.activities (
    recipient_id,
    actor_id,
    type,
    direct_message_id,
    story_id,
    message
  )
  values (
    new.recipient_id,
    new.sender_id,
    'direct_message',
    new.id,
    new.story_id,
    new.body
  );
  return new;
end;
$$;

drop trigger if exists direct_message_activity_after_insert on public.direct_messages;
create trigger direct_message_activity_after_insert
after insert on public.direct_messages
for each row execute function public.create_activity_from_direct_message();

revoke all on function public.create_activity_from_direct_message() from public;

create index if not exists activities_direct_message_recipient_idx
  on public.activities (direct_message_id, recipient_id, created_at desc)
  where direct_message_id is not null;
