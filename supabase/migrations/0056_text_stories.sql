-- Junta2: Estados de solo texto.
-- Mantiene historias image/video existentes y permite publicar texto sin archivo multimedia.
alter table public.stories
  alter column media_url drop not null;

alter table public.stories
  drop constraint if exists stories_media_type_check;

alter table public.stories
  add constraint stories_media_type_check
  check (media_type in ('image', 'video', 'text'));

alter table public.stories
  add column if not exists text_content text,
  add column if not exists text_background_color text,
  add column if not exists text_font_family text;

alter table public.stories
  drop constraint if exists stories_content_shape_check,
  drop constraint if exists stories_text_color_check;

alter table public.stories
  add constraint stories_content_shape_check
  check (
    (media_type = 'text' and char_length(trim(coalesce(text_content, ''))) between 1 and 500 and media_url is null)
    or
    (media_type in ('image', 'video') and media_url is not null)
  );

alter table public.stories
  add constraint stories_text_color_check
  check (text_background_color is null or text_background_color ~ '^#[0-9A-Fa-f]{6}$');

comment on column public.stories.text_content is 'Contenido de un Estado de solo texto; solo se usa cuando media_type=text.';
comment on column public.stories.text_background_color is 'Color hexadecimal de fondo para Estados de texto.';
comment on column public.stories.text_font_family is 'Familia visual seleccionada para Estados de texto.';

notify pgrst, 'reload schema';
