-- Tragos Sociales: borrado seguro de publicaciones oficiales.
-- Ejecutar después del SQL consolidado anterior.

alter table if exists public.official_posts
  add column if not exists deleted_at timestamptz;

create or replace function public.admin_soft_delete_official_post(p_post_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    return false;
  end if;

  update public.official_posts
     set deleted_at = coalesce(deleted_at, now())
   where id = p_post_id;

  return found;
end;
$$;

revoke all on function public.admin_soft_delete_official_post(uuid) from public;
grant execute on function public.admin_soft_delete_official_post(uuid) to authenticated;

-- Mantener compatibles tanto el borrado lógico usado por la app como el DELETE directo.
drop policy if exists official_posts_update_admin on public.official_posts;
create policy official_posts_update_admin on public.official_posts
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists official_posts_delete_admin on public.official_posts;
create policy official_posts_delete_admin on public.official_posts
for delete to authenticated
using (public.is_admin());

notify pgrst, 'reload schema';
