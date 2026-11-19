-- 0070: mensajes de ubicación y reproducción de segmentos editados en Chat.
alter table public.direct_messages
  add column if not exists trim_start_ms integer,
  add column if not exists trim_end_ms integer,
  add column if not exists is_muted boolean not null default false,
  add column if not exists overlay_text text;

alter table public.direct_messages
drop constraint if exists direct_messages_kind_check;
alter table public.direct_messages
  add constraint direct_messages_kind_check
  check (kind in (
    'chat', 'text', 'story_reaction', 'story_reply', 'story_quick_reaction',
    'voice_note', 'image', 'video', 'location'
  ));

create index if not exists direct_messages_location_idx
  on public.direct_messages (kind, created_at desc)
  where kind = 'location';
