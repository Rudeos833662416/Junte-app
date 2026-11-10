-- 0046: proteger metadatos PostGIS que no forman parte de la API pública de Junta2.
-- Las funciones PostGIS/Edge Functions con privilegios del propietario siguen funcionando.
alter table if exists public.spatial_ref_sys enable row level security;

-- No se crean políticas para anon/authenticated deliberadamente:
-- la app no debe leer ni modificar esta tabla directamente.
-- activity_push_deliveries y notification_action_tokens ya tienen RLS activo
-- y permanecen sin políticas de cliente: solo service_role/Edge Functions los usan.
