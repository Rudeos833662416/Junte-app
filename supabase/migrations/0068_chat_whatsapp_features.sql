-- 0068: funciones de Chat estilo WhatsApp.
-- Seguro para instalaciones que ya tienen parte del esquema multimedia.
alter table public.direct_messages
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists reactions jsonb not null default '{}'::jsonb,
  add column if not exists location_payload jsonb;

update public.direct_messages
set reactions = '{}'::jsonb
where reactions is null;

alter table public.direct_messages
  alter column reactions set default '{}'::jsonb,
  alter column reactions set not null;

create index if not exists direct_messages_edited_idx
  on public.direct_messages (edited_at)
  where edited_at is not null;

create index if not exists direct_messages_deleted_idx
  on public.direct_messages (deleted_at)
  where deleted_at is not null;

-- El remitente puede editar/eliminar solo sus propios mensajes. El destinatario
-- conserva la capacidad ya existente de marcar read_at desde el cliente.
drop policy if exists direct_messages_update_sender on public.direct_messages;
create policy direct_messages_update_sender
  on public.direct_messages
  for update to authenticated
  using (
    sender_id = (select auth.uid())
    and not public.is_blocked_between(sender_id, recipient_id)
  )
  with check (
    sender_id = (select auth.uid())
    and not public.is_blocked_between(sender_id, recipient_id)
  );

grant update (body, edited_at, deleted_at, read_at) on public.direct_messages to authenticated;

create or replace function public.toggle_message_reaction(
  p_message_id uuid,
  p_emoji text
)
returns public.direct_messages
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_message public.direct_messages;
  v_reactions jsonb;
  v_current text;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if p_emoji is null or char_length(trim(p_emoji)) = 0 or char_length(p_emoji) > 16 then
    raise exception 'invalid_emoji' using errcode = '22023';
  end if;

  select * into v_message
  from public.direct_messages
  where id = p_message_id
    and (sender_id = v_user_id or recipient_id = v_user_id)
    and not public.is_blocked_between(sender_id, recipient_id)
  for update;

  if not found then
    raise exception 'message_not_found_or_forbidden' using errcode = '42501';
  end if;

  v_reactions := coalesce(v_message.reactions, '{}'::jsonb);
  v_current := v_reactions ->> v_user_id::text;
  if v_current = p_emoji then
    v_reactions := v_reactions - v_user_id::text;
  else
    v_reactions := jsonb_set(v_reactions, array[v_user_id::text], to_jsonb(trim(p_emoji)), true);
  end if;

  update public.direct_messages
  set reactions = v_reactions
  where id = p_message_id
  returning * into v_message;

  return v_message;
end;
$$;

revoke all on function public.toggle_message_reaction(uuid, text) from public;
grant execute on function public.toggle_message_reaction(uuid, text) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.direct_messages;
exception
  when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
