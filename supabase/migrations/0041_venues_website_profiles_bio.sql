alter table public.venues add column if not exists website_url text;
alter table public.venues alter column source set default 'admin';

drop function if exists public.get_visible_profiles(uuid[]);
create function public.get_visible_profiles(p_ids uuid[])
returns table(id uuid, name text, avatar_url text, cover_url text, bio text)
language sql stable security definer set search_path to 'public'
as $function$
  select p.id, p.name, p.avatar_url, p.cover_url, p.bio
  from public.profiles p
  where p.id = any(p_ids)
    and (
      p.id = auth.uid()
      or coalesce(p.is_public, false) = true
      or exists (
        select 1 from public.friendships f
        where (f.status = 'accepted'
          and ((f.user_id = auth.uid() and f.friend_id = p.id)
            or (f.friend_id = auth.uid() and f.user_id = p.id)))
          or (f.status = 'pending' and f.friend_id = auth.uid() and f.user_id = p.id)
      )
    );
$function$;
grant execute on function public.get_visible_profiles(uuid[]) to authenticated;
grant execute on function public.get_visible_profiles(uuid[]) to anon;
