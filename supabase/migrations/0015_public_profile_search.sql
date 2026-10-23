alter table public.profiles add column if not exists username text;

create unique index if not exists profiles_username_lower_unique
on public.profiles (lower(username))
where username is not null and length(trim(username)) > 0;

create or replace function public.search_public_profiles(p_query text)
returns table (
  id uuid,
  name text,
  username text,
  avatar_url text,
  cover_url text,
  bio text
)
language sql
security definer
set search_path = public
as $$
  select p.id, p.name, p.username, p.avatar_url, p.cover_url, p.bio
  from public.profiles p
  where p.id <> auth.uid()
    and coalesce(p.is_public, false) = true
    and length(trim(coalesce(p_query, ''))) >= 2
    and (
      lower(coalesce(p.username, '')) like '%' || lower(trim(p_query)) || '%'
      or lower(coalesce(p.name, '')) like '%' || lower(trim(p_query)) || '%'
      or lower(coalesce(p.email, '')) like '%' || lower(trim(p_query)) || '%'
    )
  order by lower(coalesce(p.name, p.username, ''))
  limit 25;
$$;

grant execute on function public.search_public_profiles(text) to authenticated;
