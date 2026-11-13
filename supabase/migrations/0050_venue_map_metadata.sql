-- 0050: metadata opcional para pines y preview cards de locales.
alter table public.venues
  add column if not exists category text not null default 'bar',
  add column if not exists opening_hours text,
  add column if not exists venue_status text not null default 'unknown',
  add column if not exists rating numeric,
  add column if not exists active_promotion text;

alter table public.venues drop constraint if exists venues_category_check;
alter table public.venues add constraint venues_category_check
  check (category in ('bar', 'club', 'event', 'cafe', 'restaurant', 'other'));
alter table public.venues drop constraint if exists venues_status_check;
alter table public.venues add constraint venues_status_check
  check (venue_status in ('open', 'closed', 'unknown'));
alter table public.venues drop constraint if exists venues_rating_check;
alter table public.venues add constraint venues_rating_check
  check (rating is null or (rating >= 0 and rating <= 5));

create index if not exists venues_map_category_location_idx
  on public.venues (category, latitude, longitude)
  where latitude is not null and longitude is not null;
