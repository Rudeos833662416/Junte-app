-- 0067: metadatos de recorte/silencio/overlay para estados de video (estilo WhatsApp).
-- trim_start_sec / trim_end_sec ya existen; añadimos is_muted y reutilizamos text_content como overlay.

alter table public.stories
  add column if not exists is_muted boolean not null default false;

comment on column public.stories.is_muted is 'Si true, el visor reproduce el video sin audio.';
comment on column public.stories.trim_start_sec is 'Inicio del segmento de video en segundos (recorte cliente).';
comment on column public.stories.trim_end_sec is 'Fin del segmento de video en segundos (recorte cliente).';
comment on column public.stories.text_content is 'Texto de estado de texto, o texto superpuesto en video.';
