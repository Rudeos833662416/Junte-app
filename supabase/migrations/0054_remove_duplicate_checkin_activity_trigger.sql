-- 0054: un único productor de actividades para check-in/check-out
-- Causa corregida: trigger_on_checkin_created llamaba a handle_new_checkin(),
-- que insertaba otra actividad sin checkin_id además de create_checkin_activity().

-- Retirar el trigger legado que generaba duplicados sin checkin_id.
drop trigger if exists trigger_on_checkin_created on public.checkins;

-- Normalizar nombres históricos del trigger canónico para que solo exista uno.
drop trigger if exists checkin_activity_after_change on public.checkins;
drop trigger if exists checkin_activity_after_insert on public.checkins;

create trigger checkin_activity_after_insert
after insert or update of status on public.checkins
for each row execute function public.create_checkin_activity();

comment on function public.create_checkin_activity() is
  'Canonical and idempotent producer of check_in/check_out activities.';

notify pgrst, 'reload schema';
