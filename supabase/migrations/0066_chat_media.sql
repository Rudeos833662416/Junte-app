-- 0066: fotos y videos en chat (estilo WhatsApp), bucket privado chat-media.

alter table public.direct_messages
  add column if not exists media_path text,
  add column if not exists media_type text;

alter table public.direct_messages
  drop constraint if exists direct_messages_kind_check;

alter table public.direct_messages
  add constraint direct_messages_kind_check
  check (kind in (
    'chat', 'text', 'story_reaction', 'story_reply', 'story_quick_reaction',
    'voice_note', 'image', 'video'
  ));

-- Permitir body vacío en mensajes solo-media / voz
alter table public.direct_messages
  drop constraint if exists direct_messages_body_check;

alter table public.direct_messages
  add constraint direct_messages_body_check
  check (
    char_length(body) <= 1000
    and (
      kind in ('image', 'video', 'voice_note')
      or char_length(trim(both from body)) >= 1
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-media',
  'chat-media',
  false,
  47185920,
  array[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'video/mp4',
    'video/quicktime',
    'video/3gpp',
    'video/webm'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists chat_media_select_participants on storage.objects;
create policy chat_media_select_participants on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chat-media'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (storage.foldername(name))[2] = (select auth.uid())::text
    )
  );

drop policy if exists chat_media_insert_sender on storage.objects;
create policy chat_media_insert_sender on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chat-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists chat_media_delete_sender on storage.objects;
create policy chat_media_delete_sender on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'chat-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create index if not exists idx_direct_messages_media_path
  on public.direct_messages (media_path)
  where media_path is not null;
