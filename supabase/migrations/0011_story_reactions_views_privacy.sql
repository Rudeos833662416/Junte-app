-- Sky Night: reacciones, vistas y privacidad avanzada en Historias / Estados

create table if not exists public.close_friends (
  owner_id uuid not null references auth.users(id) on delete cascade,
  friend_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, friend_id),
  constraint close_friends_not_self check (owner_id <> friend_id)
);

create table if not exists public.story_reactions (
  id uuid primary key default gen_random_uuid(),
  story_id bigint not null references public.stories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (emoji in ('🔥', '❤️', '👏', '😂', '😮', '🍻')),
  created_at timestamptz not null default now(),
  constraint story_reactions_user_story_unique unique (story_id, user_id)
);

create table if not exists public.story_views (
  id uuid primary key default gen_random_uuid(),
  story_id bigint not null references public.stories(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  constraint story_views_story_viewer_unique unique (story_id, viewer_id)
);

alter table public.stories add column if not exists privacy text;

update public.stories
set privacy = case when visibility = 'public' then 'public' else 'all_friends' end
where privacy is null or privacy not in ('all_friends', 'close_friends', 'public');

alter table public.stories alter column privacy set default 'all_friends';
alter table public.stories alter column privacy set not null;
alter table public.stories drop constraint if exists stories_privacy_check;
alter table public.stories add constraint stories_privacy_check
  check (privacy in ('all_friends', 'close_friends', 'public'));

alter table public.close_friends enable row level security;
alter table public.story_reactions enable row level security;
alter table public.story_views enable row level security;

drop policy if exists close_friends_select_related on public.close_friends;
create policy close_friends_select_related on public.close_friends
for select to authenticated using (owner_id = auth.uid() or friend_id = auth.uid());
drop policy if exists close_friends_insert_own on public.close_friends;
create policy close_friends_insert_own on public.close_friends
for insert to authenticated
with check (
  owner_id = auth.uid()
  and exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.user_id = auth.uid() and f.friend_id = close_friends.friend_id)
        or (f.friend_id = auth.uid() and f.user_id = close_friends.friend_id))
  )
);
drop policy if exists close_friends_delete_own on public.close_friends;
create policy close_friends_delete_own on public.close_friends
for delete to authenticated using (owner_id = auth.uid());

drop policy if exists stories_select_visible on public.stories;
create policy stories_select_visible on public.stories
for select to authenticated
using (
  expires_at > now()
  and (
    user_id = auth.uid()
    or privacy = 'public'
    or (
      privacy = 'all_friends'
      and exists (
        select 1 from public.friendships f
        where f.status = 'accepted'
          and ((f.user_id = auth.uid() and f.friend_id = stories.user_id)
            or (f.friend_id = auth.uid() and f.user_id = stories.user_id))
      )
    )
    or (
      privacy = 'close_friends'
      and exists (
        select 1 from public.close_friends cf
        where cf.owner_id = stories.user_id and cf.friend_id = auth.uid()
      )
    )
  )
);

drop policy if exists story_reactions_select_policy on public.story_reactions;
create policy story_reactions_select_policy on public.story_reactions
for select to authenticated
using (
  user_id = auth.uid()
  or exists (select 1 from public.stories s where s.id = story_id and s.user_id = auth.uid())
);
drop policy if exists story_reactions_insert_policy on public.story_reactions;
create policy story_reactions_insert_policy on public.story_reactions
for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (select 1 from public.stories s where s.id = story_id and s.expires_at > now())
);
drop policy if exists story_reactions_update_policy on public.story_reactions;
create policy story_reactions_update_policy on public.story_reactions
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists story_reactions_delete_policy on public.story_reactions;
create policy story_reactions_delete_policy on public.story_reactions
for delete to authenticated using (user_id = auth.uid());

drop policy if exists story_views_select_policy on public.story_views;
create policy story_views_select_policy on public.story_views
for select to authenticated
using (
  viewer_id = auth.uid()
  or exists (select 1 from public.stories s where s.id = story_id and s.user_id = auth.uid())
);
drop policy if exists story_views_insert_policy on public.story_views;
create policy story_views_insert_policy on public.story_views
for insert to authenticated
with check (
  viewer_id = auth.uid()
  and exists (select 1 from public.stories s where s.id = story_id and s.expires_at > now())
);

grant select, insert, update, delete on table public.close_friends to authenticated;
grant select, insert, update, delete on table public.story_reactions to authenticated;
grant select, insert on table public.story_views to authenticated;

create index if not exists close_friends_friend_idx on public.close_friends(friend_id);
create index if not exists story_reactions_story_idx on public.story_reactions(story_id, created_at desc);
create index if not exists story_views_story_idx on public.story_views(story_id, viewed_at desc);
