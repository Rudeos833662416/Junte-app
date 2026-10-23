-- Tragos Sociales: autoría oficial visible y borrado lógico seguro.
-- Ejecutar en Supabase SQL Editor después de 0021/0022.

alter table if exists public.official_posts
  add column if not exists deleted_at timestamptz;

alter table if exists public.profiles
  add column if not exists username text;

-- Las publicaciones eliminadas dejan de aparecer inmediatamente sin depender de
-- que el cliente desmonte un reproductor nativo en el mismo frame del DELETE.
drop policy if exists official_posts_select_authenticated on public.official_posts;
create policy official_posts_select_authenticated on public.official_posts
for select to authenticated
using (deleted_at is null);

-- Replica identity completa permite que Realtime entregue el id de la fila
-- eliminada, incluso cuando la app usa filtros o RLS.
alter table public.official_posts replica identity full;

-- Devuelve únicamente los autores de publicaciones oficiales visibles. Es una
-- función SECURITY DEFINER para que el nombre y avatar del administrador no
-- dependan de que el espectador sea amigo suyo o tenga el perfil público.
create or replace function public.get_official_post_authors(p_post_ids uuid[])
returns table (
  id uuid,
  name text,
  username text,
  avatar_url text
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    u.id,
    coalesce(
      nullif(trim(p.name), ''),
      nullif(trim(p.username), ''),
      nullif(trim(split_part(coalesce(u.email, ''), '@', 1)), ''),
      'Administrador'
    ) as name,
    nullif(trim(p.username), '') as username,
    p.avatar_url
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id in (
    select op.created_by
    from public.official_posts op
    where op.id = any(coalesce(p_post_ids, '{}'::uuid[]))
      and op.deleted_at is null
  );
$$;

revoke all on function public.get_official_post_authors(uuid[]) from public;
grant execute on function public.get_official_post_authors(uuid[]) to authenticated;

-- Solo el administrador puede marcar una publicación como eliminada.
drop policy if exists official_posts_update_admin on public.official_posts;
create policy official_posts_update_admin on public.official_posts
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Asegura que la API vea columnas y funciones nuevas sin esperar a un refresh manual.
notify pgrst, 'reload schema';
