-- 0058: contexto de Estados y respuestas dentro de mensajes directos.
-- Mantiene compatibilidad con mensajes existentes y permite renderizar citas sin texto duplicado.
alter table public.direct_messages
  add column if not exists story_id bigint references public.stories(id) on delete set null,
  add column if not exists kind text not null default 'chat',
  add column if not exists reply_to_message_id uuid references public.direct_messages(id) on delete set null;

alter table public.direct_messages
  drop constraint if exists direct_messages_kind_check;

alter table public.direct_messages
  add constraint direct_messages_kind_check
  check (kind in ('chat', 'text', 'story_reaction', 'story_reply', 'story_quick_reaction'));

create index if not exists direct_messages_story_context_idx
  on public.direct_messages (story_id, created_at desc)
  where story_id is not null;

create index if not exists direct_messages_reply_idx
  on public.direct_messages (reply_to_message_id)
  where reply_to_message_id is not null;
