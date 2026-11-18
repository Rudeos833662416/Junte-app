-- 0061: despacho inmediato de notificaciones con pg_net
-- La outbox y pg_cron permanecen como fallback y mecanismo de reintento.

create or replace function public.enqueue_activity_push()
returns trigger
language plpgsql
security definer
set search_path = public, net
as $$
declare
  outbox_id uuid;
begin
  insert into public.notification_outbox (activity_id, payload)
  values (new.id, to_jsonb(new))
  on conflict (activity_id) do nothing
  returning id into outbox_id;

  if outbox_id is not null then
    begin
      perform net.http_post(
        url := 'https://cymhbwgxmezrwofkbdqz.supabase.co/functions/v1/notify-activity',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object('record', to_jsonb(new), 'outbox_id', outbox_id),
        timeout_milliseconds := 5000
      );
    exception when others then
      -- Si pg_net no está disponible, pg_cron procesará la fila queued.
      raise warning 'Immediate notification dispatch unavailable for activity %: %', new.id, sqlerrm;
    end;
  end if;

  return new;
end;
$$;

revoke all on function public.enqueue_activity_push() from public;
grant execute on function public.enqueue_activity_push() to service_role;

notify pgrst, 'reload schema';
