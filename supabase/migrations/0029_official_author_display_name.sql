-- Tragos Sociales: nombre visible robusto para cada cuenta que publica en Eventos.
-- Ejecutar después de 0025 y 0028.

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
      'Cuenta oficial'
    ) as name,
    coalesce(
      nullif(trim(p.username), ''),
      nullif(trim(split_part(coalesce(u.email, ''), '@', 1)), ''),
      'cuenta_oficial'
    ) as username,
    nullif(trim(p.avatar_url), '') as avatar_url
  from unnest(coalesce(p_post_ids, '{}'::uuid[])) requested(id)
  join public.official_posts op
    on op.created_by = requested.id
   and op.id = any(coalesce(p_post_ids, '{}'::uuid[]))
  join auth.users u on u.id = op.created_by
  left join public.profiles p on p.id = u.id
  where op.deleted_at is null
  group by u.id, p.name, p.username, p.avatar_url, u.email;
$$;

revoke all on function public.get_official_post_authors(uuid[]) from public;
grant execute on function public.get_official_post_authors(uuid[]) to authenticated;

notify pgrst, 'reload schema';
