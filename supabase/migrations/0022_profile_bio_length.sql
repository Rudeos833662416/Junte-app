-- Tragos Sociales: ampliar la biografía de 100 a 280 caracteres.
-- Ejecutar en Supabase SQL Editor si 0010 ya fue aplicada.

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
  drop constraint if exists profiles_bio_max_length;

alter table if exists public.profiles
  add constraint profiles_bio_max_length
  check (bio is null or char_length(bio) <= 280);

NOTIFY pgrst, 'reload schema';
