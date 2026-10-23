-- Sky Night: sincronización de reacciones y notificaciones de actividad

-- 1. Ampliar tipos de actividad permitidos para incluir reacciones a check-ins y estados.
alter table public.activities drop constraint if exists activities_type_check;
alter table public.activities add constraint activities_type_check
  check (type in ('check_in', 'check_out', 'friend_request', 'reaction_checkin', 'reaction_story'));

-- 2. Añadir columnas opcionales para asociar reacciones a checkins, historias y guardar el emoji.
alter table public.activities
  add column if not exists reaction_emoji text,
  add column if not exists story_id bigint references public.stories(id) on delete set null;

-- 3. Asegurar restricciones únicas para evitar duplicados en reacciones de check-in e historias.
alter table public.activities drop constraint if exists activities_reaction_checkin_unique;
alter table public.activities add constraint activities_reaction_checkin_unique
  unique (recipient_id, checkin_id, type, actor_id);

alter table public.activities drop constraint if exists activities_reaction_story_unique;
alter table public.activities add constraint activities_reaction_story_unique
  unique (recipient_id, story_id, type, actor_id);

-- 4. Habilitar Realtime en la tabla activities.
do $$
begin
  alter publication supabase_realtime add table public.activities;
exception
  when duplicate_object then null;
end
$$;
