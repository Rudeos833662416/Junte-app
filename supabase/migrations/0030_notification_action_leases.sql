-- 0030: notification action tokens + client_message_id + comment_reply
-- Refleja el estado de producción (leases, claim RPC, dedupe de chat).

create table if not exists public.notification_action_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_id text,
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  used_at timestamptz,
  created_at timestamptz not null default now(),
  friendship_id uuid,
  action_type text,
  friendship_id_bigint bigint,
  sender_id uuid,
  recipient_id uuid,
  processing_at timestamptz,
  lease_id uuid,
  attempts integer not null default 0
);

create unique index if not exists notification_action_tokens_hash_uidx
  on public.notification_action_tokens (token_hash);

create index if not exists notification_action_tokens_user_idx
  on public.notification_action_tokens (user_id);

create index if not exists notification_action_tokens_expires_idx
  on public.notification_action_tokens (expires_at);

alter table public.notification_action_tokens enable row level security;

-- Solo service role / edge functions (sin policies para authenticated)

alter table public.direct_messages
  add column if not exists client_message_id uuid;

create unique index if not exists direct_messages_client_message_id_uidx
  on public.direct_messages (client_message_id)
  where client_message_id is not null;

create table if not exists public.activity_push_deliveries (
  delivery_key text not null,
  token_id bigint not null,
  claimed_at timestamptz not null default now(),
  primary key (delivery_key, token_id)
);

alter table public.activity_push_deliveries enable row level security;

-- claim token con lease (permite reintentos y reply múltiple en chat)
create or replace function public.claim_notification_action_token(
  p_token_hash text,
  p_action_type text,
  p_lease_seconds integer default 120
)
returns table (
  id uuid,
  user_id uuid,
  activity_id text,
  friendship_id_bigint bigint,
  sender_id uuid,
  recipient_id uuid,
  action_type text,
  lease_id uuid
)
language sql
security definer
set search_path to 'public'
as $function$
  update public.notification_action_tokens
     set processing_at = now(),
         lease_id = gen_random_uuid(),
         attempts = attempts + 1
   where token_hash = p_token_hash
     and action_type = p_action_type
     and used_at is null
     and expires_at > now()
     and (
       processing_at is null
       or processing_at < now() - make_interval(secs => greatest(p_lease_seconds, 30))
     )
  returning
    notification_action_tokens.id,
    notification_action_tokens.user_id,
    notification_action_tokens.activity_id,
    notification_action_tokens.friendship_id_bigint,
    notification_action_tokens.sender_id,
    notification_action_tokens.recipient_id,
    notification_action_tokens.action_type,
    notification_action_tokens.lease_id;
$function$;

create or replace function public.cleanup_notification_action_tokens()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare removed integer;
begin
  delete from public.notification_action_tokens
   where expires_at < now() or used_at < now() - interval '1 day';
  get diagnostics removed = row_count;
  return removed;
end;
$function$;

-- activity type comment_reply (si el check constraint lo permite)
do $$
begin
  alter table public.activities drop constraint if exists activities_type_check;
exception when undefined_object then null;
end $$;

alter table public.activities
  add constraint activities_type_check
  check (type = any (array[
    'check_in'::text,
    'check_out'::text,
    'friend_request'::text,
    'reaction_checkin'::text,
    'reaction_story'::text,
    'direct_message'::text,
    'official_post'::text,
    'story_new'::text,
    'comment_reply'::text
  ]));

create or replace function public.create_activity_from_comment_reply()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.parent_comment_id is null then
    return new;
  end if;

  insert into public.activities (
    recipient_id, actor_id, type, official_post_id, comment_id, message
  )
  select
    parent.user_id, new.user_id, 'comment_reply', new.post_id, new.id,
    'respondió a tu comentario'
  from public.official_post_comments parent
  where parent.id = new.parent_comment_id
    and parent.user_id <> new.user_id
  on conflict do nothing;

  return new;
end;
$function$;

drop trigger if exists trg_comment_reply_activity on public.official_post_comments;
create trigger trg_comment_reply_activity
  after insert on public.official_post_comments
  for each row
  execute function public.create_activity_from_comment_reply();

revoke all on function public.claim_notification_action_token(text, text, integer) from public;
revoke all on function public.cleanup_notification_action_tokens() from public;
grant execute on function public.claim_notification_action_token(text, text, integer) to service_role;
grant execute on function public.cleanup_notification_action_tokens() to service_role;
