-- Junta2: Realtime robusto para pines del mapa.
-- Ejecutar en Supabase SQL Editor si esta migración aún no fue aplicada.

alter table if exists public.venues replica identity full;

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'venues'
  ) then
    alter publication supabase_realtime add table public.venues;
  end if;
end
$$;
