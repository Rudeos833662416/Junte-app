-- Tragos Sociales: permitir biografías de hasta 280 caracteres

alter table if exists public.profiles
  add column if not exists bio text;

do $$
declare constraint_row record;
begin
  for constraint_row in
    select conname
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and pg_get_constraintdef(oid) ilike '%char_length(bio)%'
  loop
    execute format('alter table public.profiles drop constraint if exists %I', constraint_row.conname);
  end loop;
end $$;

alter table if exists public.profiles
  add constraint profiles_bio_max_length check (bio is null or char_length(bio) <= 280);

create or replace view public.public_profiles as
select id, name, avatar_url, cover_url, bio
from public.profiles
where coalesce(is_public, false) = true;

grant select on public.public_profiles to authenticated;
