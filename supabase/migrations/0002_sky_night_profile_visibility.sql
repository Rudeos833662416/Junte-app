-- Sky Night: permitir que usuarios autenticados vean el nombre público de los perfiles.
-- No inserta datos de prueba ni modifica usuarios existentes.

drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated on public.profiles
for select to authenticated
using (true);
