-- 0020: Chat privado y notificación de reacciones a Estados

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint direct_messages_not_self check (sender_id <> recipient_id)
);

alter table public.direct_messages add column if not exists read_at timestamptz;
create index if not exists direct_messages_pair_created_idx
  on public.direct_messages (sender_id, recipient_id, created_at);
create index if not exists direct_messages_unread_recipient_idx
  on public.direct_messages (recipient_id, read_at)
  where read_at is null;

alter table public.direct_messages enable row level security;
drop policy if exists direct_messages_select_participants on public.direct_messages;
create policy direct_messages_select_participants on public.direct_messages
for select to authenticated using (sender_id = auth.uid() or recipient_id = auth.uid());
drop policy if exists direct_messages_insert_sender on public.direct_messages;
create policy direct_messages_insert_sender on public.direct_messages
for insert to authenticated with check (sender_id = auth.uid() and sender_id <> recipient_id);
grant select, insert on table public.direct_messages to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.direct_messages;
exception when duplicate_object then null;
end $$;

-- Nunca se permite reaccionar al propio Estado.
drop policy if exists story_reactions_insert_policy on public.story_reactions;
create policy story_reactions_insert_policy on public.story_reactions
for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.stories s
    where s.id = story_id and s.expires_at > now() and s.user_id <> auth.uid()
  )
);

create or replace function public.create_activity_from_story_reaction()
returns trigger language plpgsql security definer set search_path = public
as $$
declare owner_id uuid;
begin
  select s.user_id into owner_id from public.stories s where s.id = new.story_id;
  if owner_id is null or owner_id = new.user_id then return new; end if;
  insert into public.activities (recipient_id, actor_id, type, story_id, reaction_emoji, message)
  values (owner_id, new.user_id, 'reaction_story', new.story_id, new.emoji, 'reaccionó a tu Estado ' || new.emoji)
  on conflict (recipient_id, story_id, type, actor_id)
  do update set reaction_emoji = excluded.reaction_emoji, message = excluded.message, created_at = now(), read_at = null;
  return new;
end;
$$;

drop trigger if exists story_reaction_activity_after_change on public.story_reactions;
create trigger story_reaction_activity_after_change
after insert or update of emoji on public.story_reactions
for each row execute function public.create_activity_from_story_reaction();

revoke all on function public.create_activity_from_story_reaction() from public;


-- Permitir actividades de mensajes directos y crear una actividad para disparar el webhook push.
alter table public.activities drop constraint if exists activities_type_check;
alter table public.activities add constraint activities_type_check
  check (type in ('check_in', 'check_out', 'friend_request', 'reaction_checkin', 'reaction_story', 'direct_message'));
create or replace function public.create_activity_from_direct_message()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.activities (recipient_id, actor_id, type, message)
  values (new.recipient_id, new.sender_id, 'direct_message', new.body);
  return new;
end;
$$;
drop trigger if exists direct_message_activity_after_insert on public.direct_messages;
create trigger direct_message_activity_after_insert after insert on public.direct_messages
for each row execute function public.create_activity_from_direct_message();
revoke all on function public.create_activity_from_direct_message() from public;
