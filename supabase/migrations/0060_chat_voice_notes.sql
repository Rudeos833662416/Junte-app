-- 0060: notas de voz privadas dentro de conversaciones.
alter table public.direct_messages
  add column if not exists audio_path text,
  add column if not exists duration_ms integer;

alter table public.direct_messages
  drop constraint if exists direct_messages_kind_check;

alter table public.direct_messages
  add constraint direct_messages_kind_check
  check (kind in ('chat', 'text', 'story_reaction', 'story_reply', 'story_quick_reaction', 'voice_note'));

insert into storage.buckets (id, name, public, allowed_mime_types)
values ('chat-audio', 'chat-audio', false, array['audio/mp4', 'audio/m4a', 'audio/3gpp', 'audio/aac', 'audio/webm'])
on conflict (id) do update set public = false, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists chat_audio_select_participants on storage.objects;
create policy chat_audio_select_participants on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chat-audio'
    and ((storage.foldername(name))[1] = auth.uid()::text or (storage.foldername(name))[2] = auth.uid()::text)
  );

drop policy if exists chat_audio_insert_sender on storage.objects;
create policy chat_audio_insert_sender on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chat-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists chat_audio_delete_sender on storage.objects;
create policy chat_audio_delete_sender on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'chat-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
