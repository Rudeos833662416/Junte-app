-- Sky Night: lugares geolocalizados y actividad social real

alter table if exists public.venues
  add column if not exists country text,
  add column if not exists source text,
  add column if not exists source_id text,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists venues_source_source_id_key
  on public.venues (source, source_id)
  where source is not null and source_id is not null;

create index if not exists venues_geo_idx
  on public.venues (latitude, longitude);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('check_in', 'check_out', 'friend_request')),
  checkin_id bigint references public.checkins(id) on delete set null,
  venue_id bigint references public.venues(id) on delete set null,
  message text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint activities_checkin_type_unique unique (recipient_id, checkin_id, type)
);

create index if not exists activities_recipient_created_idx
  on public.activities (recipient_id, created_at desc);

alter table public.activities enable row level security;
drop policy if exists activities_select_related on public.activities;
create policy activities_select_related on public.activities
for select to authenticated
using (recipient_id = auth.uid());
drop policy if exists activities_update_own on public.activities;
create policy activities_update_own on public.activities
for update to authenticated
using (recipient_id = auth.uid())
with check (recipient_id = auth.uid());

create or replace function public.create_checkin_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  action_type text;
  venue_label text;
begin
  if tg_op = 'INSERT' then
    action_type := 'check_in';
  elsif old.status = 'active' and new.status = 'ended' then
    action_type := 'check_out';
  else
    return new;
  end if;

  select coalesce(v.name, 'un lugar')
    into venue_label
  from public.venues v
  where v.id = new.venue_id;

  insert into public.activities (recipient_id, actor_id, type, checkin_id, venue_id, message)
  select
    case when f.user_id = new.user_id then f.friend_id else f.user_id end,
    new.user_id,
    action_type,
    new.id,
    new.venue_id,
    case when action_type = 'check_in'
      then 'está tomando algo en ' || coalesce(venue_label, 'un lugar')
      else 'ha terminado su visita en ' || coalesce(venue_label, 'un lugar')
    end
  from public.friendships f
  where f.status = 'accepted'
    and (f.user_id = new.user_id or f.friend_id = new.user_id)
  on conflict (recipient_id, checkin_id, type) do nothing;

  return new;
end;
$$;

drop trigger if exists checkin_activity_after_change on public.checkins;
create trigger checkin_activity_after_change
after insert or update of status on public.checkins
for each row execute function public.create_checkin_activity();

revoke all on function public.create_checkin_activity() from public;

-- Habilitar eventos Realtime de forma idempotente.
do $$
begin
  alter publication supabase_realtime add table public.checkins;
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter publication supabase_realtime add table public.activities;
exception
  when duplicate_object then null;
end
$$;
