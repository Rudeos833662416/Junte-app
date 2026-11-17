-- 0055: outbox durable para desacoplar la creación de actividades del proveedor push

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  payload jsonb not null,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'dispatched', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz not null default now(),
  dispatched_at timestamptz,
  unique (activity_id)
);

create index if not exists notification_outbox_ready_idx
  on public.notification_outbox (next_attempt_at, created_at)
  where status in ('queued', 'processing');

alter table public.notification_outbox enable row level security;
revoke all on table public.notification_outbox from anon, authenticated;
grant select, insert, update, delete on table public.notification_outbox to service_role;

create or replace function public.enqueue_activity_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notification_outbox (activity_id, payload)
  values (new.id, to_jsonb(new))
  on conflict (activity_id) do nothing;

  return new;
end;
$$;

revoke all on function public.enqueue_activity_push() from public;
grant execute on function public.enqueue_activity_push() to service_role;

create or replace function public.dispatch_notification_outbox()
returns integer
language plpgsql
security definer
set search_path = public, net
as $$
declare
  v_worker_id text := 'outbox-' || gen_random_uuid()::text;
  v_dispatched integer := 0;
  item record;
begin
  for item in
    with candidates as (
      select id
      from public.notification_outbox
      where attempts < 8
        and (
          (status = 'queued' and next_attempt_at <= now())
          or (status = 'processing' and locked_at < now() - interval '2 minutes')
        )
      order by created_at
      limit 25
      for update skip locked
    )
    update public.notification_outbox o
       set status = 'processing',
           attempts = o.attempts + 1,
           locked_at = now(),
           locked_by = v_worker_id,
           last_error = null
      from candidates
     where o.id = candidates.id
    returning o.*
  loop
    begin
      perform net.http_post(
        url := 'https://cymhbwgxmezrwofkbdqz.supabase.co/functions/v1/notify-activity',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object(
          'record', item.payload,
          'outbox_id', item.id
        ),
        timeout_milliseconds := 10000
      );

      update public.notification_outbox
         set status = 'dispatched',
             dispatched_at = now(),
             locked_at = null,
             locked_by = null
       where id = item.id
         and locked_by = v_worker_id;

      v_dispatched := v_dispatched + 1;
    exception when others then
      update public.notification_outbox
         set status = case when item.attempts >= 8 then 'failed' else 'queued' end,
             next_attempt_at = now() + make_interval(secs => least(900, 5 * power(2, greatest(item.attempts - 1, 0)))::integer),
             locked_at = null,
             locked_by = null,
             last_error = left(sqlerrm, 1000)
       where id = item.id
         and locked_by = v_worker_id;
    end;
  end loop;

  return v_dispatched;
end;
$$;

revoke all on function public.dispatch_notification_outbox() from public;
grant execute on function public.dispatch_notification_outbox() to service_role;

-- El trigger permanece, pero ahora solo inserta en la outbox: ya no llama al proveedor.
do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
    from cron.job
   where jobname = 'dispatch-tragos-sociales-notification-outbox'
   limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'dispatch-tragos-sociales-notification-outbox',
    '* * * * *',
    'select public.dispatch_notification_outbox();'
  );
end;
$$;

notify pgrst, 'reload schema';
