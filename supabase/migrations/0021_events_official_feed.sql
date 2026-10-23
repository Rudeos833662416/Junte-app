-- MIGRACIÓN 0021: Eventos, Top 5 y feed oficial de Tragos Sociales
-- Ejecutar con un usuario administrador de Supabase. No inserta datos de prueba.

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

alter table public.venues
  add column if not exists admin_rank integer,
  add column if not exists admin_photo_url text,
  add column if not exists description text;

alter table public.venues drop constraint if exists venues_admin_rank_check;
alter table public.venues add constraint venues_admin_rank_check
  check (admin_rank is null or admin_rank between 1 and 5);
create unique index if not exists venues_admin_rank_unique
  on public.venues (admin_rank)
  where admin_rank is not null;

create table if not exists public.official_posts (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  media_url text not null,
  media_type text not null default 'image' check (media_type in ('image', 'video')),
  caption text,
  created_at timestamptz not null default now()
);

create table if not exists public.official_post_likes (
  post_id uuid not null references public.official_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.official_posts
  add column if not exists media_width integer,
  add column if not exists media_height integer,
  add column if not exists deleted_at timestamptz;

create table if not exists public.official_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.official_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table if not exists public.official_post_shares (
  post_id uuid not null references public.official_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.official_post_comments
  add column if not exists parent_comment_id uuid references public.official_post_comments(id) on delete cascade;

create table if not exists public.official_post_comment_reactions (
  comment_id uuid not null references public.official_post_comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null default 'heart' check (reaction = 'heart'),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists official_posts_created_at_idx on public.official_posts (created_at desc);
create index if not exists official_post_comments_post_created_idx on public.official_post_comments (post_id, created_at desc);

alter table public.official_posts enable row level security;
alter table public.official_post_likes enable row level security;
alter table public.official_post_comments enable row level security;
alter table public.official_post_comment_reactions enable row level security;
alter table public.official_post_shares enable row level security;

drop policy if exists official_posts_select_authenticated on public.official_posts;
create policy official_posts_select_authenticated on public.official_posts
for select to authenticated using (deleted_at is null);
drop policy if exists official_posts_insert_admin on public.official_posts;
create policy official_posts_insert_admin on public.official_posts
for insert to authenticated with check (created_by = auth.uid() and public.is_admin());
drop policy if exists official_posts_update_admin on public.official_posts;
create policy official_posts_update_admin on public.official_posts
for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists official_posts_delete_admin on public.official_posts;
create policy official_posts_delete_admin on public.official_posts
for delete to authenticated using (public.is_admin());

drop policy if exists official_post_likes_select_authenticated on public.official_post_likes;
create policy official_post_likes_select_authenticated on public.official_post_likes
for select to authenticated using (true);
drop policy if exists official_post_likes_insert_own on public.official_post_likes;
create policy official_post_likes_insert_own on public.official_post_likes
for insert to authenticated with check (user_id = auth.uid());
drop policy if exists official_post_likes_delete_own on public.official_post_likes;
create policy official_post_likes_delete_own on public.official_post_likes
for delete to authenticated using (user_id = auth.uid());

drop policy if exists official_post_comments_select_authenticated on public.official_post_comments;
create policy official_post_comments_select_authenticated on public.official_post_comments
for select to authenticated using (true);
drop policy if exists official_post_comments_insert_own on public.official_post_comments;
create policy official_post_comments_insert_own on public.official_post_comments
for insert to authenticated with check (user_id = auth.uid());
drop policy if exists official_post_comments_delete_own_or_admin on public.official_post_comments;
create policy official_post_comments_delete_own_or_admin on public.official_post_comments
for delete to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists official_post_comment_reactions_select_authenticated on public.official_post_comment_reactions;
create policy official_post_comment_reactions_select_authenticated on public.official_post_comment_reactions
for select to authenticated using (true);
drop policy if exists official_post_comment_reactions_insert_own on public.official_post_comment_reactions;
create policy official_post_comment_reactions_insert_own on public.official_post_comment_reactions
for insert to authenticated with check (user_id = auth.uid());
drop policy if exists official_post_comment_reactions_delete_own on public.official_post_comment_reactions;
create policy official_post_comment_reactions_delete_own on public.official_post_comment_reactions
for delete to authenticated using (user_id = auth.uid());

drop policy if exists official_post_shares_select_authenticated on public.official_post_shares;
create policy official_post_shares_select_authenticated on public.official_post_shares
for select to authenticated using (true);
drop policy if exists official_post_shares_insert_own on public.official_post_shares;
create policy official_post_shares_insert_own on public.official_post_shares
for insert to authenticated with check (user_id = auth.uid());
drop policy if exists official_post_shares_delete_own on public.official_post_shares;
create policy official_post_shares_delete_own on public.official_post_shares
for delete to authenticated using (user_id = auth.uid());

drop policy if exists venues_insert_admin on public.venues;
create policy venues_insert_admin on public.venues
for insert to authenticated with check (public.is_admin());
drop policy if exists venues_update_admin on public.venues;
create policy venues_update_admin on public.venues
for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists venues_delete_admin on public.venues;
create policy venues_delete_admin on public.venues
for delete to authenticated using (public.is_admin());

grant select on public.venues to authenticated;
grant insert, update, delete on public.venues to authenticated;
grant select on public.official_posts, public.official_post_likes, public.official_post_comments, public.official_post_comment_reactions, public.official_post_shares to authenticated;
grant insert, update, delete on public.official_posts to authenticated;
grant insert, delete on public.official_post_likes, public.official_post_comments, public.official_post_comment_reactions, public.official_post_shares to authenticated;

drop policy if exists official_feed_storage_select on storage.objects;
drop policy if exists official_feed_storage_insert_admin on storage.objects;
drop policy if exists official_feed_storage_update_admin on storage.objects;
drop policy if exists official_feed_storage_delete_admin on storage.objects;
insert into storage.buckets (id, name, public)
values ('official-feed', 'official-feed', true)
on conflict (id) do update set public = true;
create policy official_feed_storage_select on storage.objects
for select to authenticated using (bucket_id = 'official-feed');
create policy official_feed_storage_insert_admin on storage.objects
for insert to authenticated with check (bucket_id = 'official-feed' and public.is_admin());
create policy official_feed_storage_update_admin on storage.objects
for update to authenticated using (bucket_id = 'official-feed' and public.is_admin()) with check (bucket_id = 'official-feed' and public.is_admin());
create policy official_feed_storage_delete_admin on storage.objects
for delete to authenticated using (bucket_id = 'official-feed' and public.is_admin());

insert into storage.buckets (id, name, public)
values ('venue-assets', 'venue-assets', true)
on conflict (id) do update set public = true;
drop policy if exists venue_assets_storage_select on storage.objects;
drop policy if exists venue_assets_storage_insert_admin on storage.objects;
drop policy if exists venue_assets_storage_update_admin on storage.objects;
drop policy if exists venue_assets_storage_delete_admin on storage.objects;
create policy venue_assets_storage_select on storage.objects
for select to authenticated using (bucket_id = 'venue-assets');
create policy venue_assets_storage_insert_admin on storage.objects
for insert to authenticated with check (bucket_id = 'venue-assets' and public.is_admin());
create policy venue_assets_storage_update_admin on storage.objects
for update to authenticated using (bucket_id = 'venue-assets' and public.is_admin()) with check (bucket_id = 'venue-assets' and public.is_admin());
create policy venue_assets_storage_delete_admin on storage.objects
for delete to authenticated using (bucket_id = 'venue-assets' and public.is_admin());

do $$ begin
  alter publication supabase_realtime add table public.venues;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.official_posts;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.official_post_likes;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.official_post_comments;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.official_post_comment_reactions;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.official_post_shares;
exception when duplicate_object then null;
end $$;

-- Para designar al administrador inicial, ejecutar manualmente con el UUID real:
-- update public.profiles set is_admin = true where id = 'UUID_DEL_ADMIN';

-- Recarga PostgREST para que la API reconozca parent_comment_id y la tabla de reacciones.
notify pgrst, 'reload schema';
