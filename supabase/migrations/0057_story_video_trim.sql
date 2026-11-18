-- Persistencia opcional del rango visible de vídeos en Estados.
-- Los valores están en segundos y no alteran historias multimedia existentes.
alter table public.stories
  add column if not exists trim_start_sec numeric not null default 0,
  add column if not exists trim_end_sec numeric;

alter table public.stories
  drop constraint if exists stories_trim_range_check;

alter table public.stories
  add constraint stories_trim_range_check
  check (
    trim_start_sec >= 0
    and (trim_end_sec is null or trim_end_sec >= trim_start_sec)
  );

comment on column public.stories.trim_start_sec is 'Segundo inicial visible del vídeo; 0 para imágenes e historias sin recorte.';
comment on column public.stories.trim_end_sec is 'Segundo final visible del vídeo; NULL significa hasta el final.';
