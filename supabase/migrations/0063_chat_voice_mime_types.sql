-- 0063: aceptar los MIME que devuelve Expo Audio según versión y dispositivo.
insert into storage.buckets (id, name, public, allowed_mime_types)
values (
  'chat-audio',
  'chat-audio',
  false,
  array[
    'audio/mpeg',
    'audio/mp4',
    'audio/m4a',
    'audio/x-m4a',
    'audio/aac',
    'audio/ogg',
    'audio/webm',
    'audio/3gpp'
  ]
)
on conflict (id) do update
set public = false,
    allowed_mime_types = excluded.allowed_mime_types;
