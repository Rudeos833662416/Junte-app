-- Sky Night: reacciones rápidas en notificaciones de Actividad

alter table if exists public.activities
  add column if not exists reaction text;

alter table if exists public.activities
  drop constraint if exists activities_reaction_check;

alter table if exists public.activities
  add constraint activities_reaction_check
  check (reaction is null or reaction in ('🍺', '🔥', '🍻', '🚀', '❤️'));

create index if not exists activities_reaction_idx
  on public.activities (recipient_id, reaction)
  where reaction is not null;

-- El destinatario puede elegir o quitar la reacción de su propia notificación.
-- La política de UPDATE existente de 0005 ya limita recipient_id = auth.uid().
