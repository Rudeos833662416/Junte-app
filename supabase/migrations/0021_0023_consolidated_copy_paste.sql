-- ============================================================
-- TRAGOS SOCIALES - SQL CONSOLIDADO PARA PEGAR DE UNA SOLA VEZ
-- Incluye: Eventos/Top 5/feed oficial, biografía de 280 caracteres y seguridad de borrado/autores.
-- Ejecutar completo en Supabase Dashboard > SQL Editor.
-- ============================================================
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


-- ============================================================
-- MIGRACIÓN 0022: BIOGRAFÍA
-- ============================================================
-- Tragos Sociales: ampliar la biografía de 100 a 280 caracteres.
-- Ejecutar en Supabase SQL Editor si 0010 ya fue aplicada.

alter table if exists public.profiles
  add column if not exists bio text;

do $$
declare constraint_row record;
begin
  for constraint_row in
    select conname
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and pg_get_constraintdef(oid) ilike '%char_length(bio)%'
  loop
    execute format('alter table public.profiles drop constraint if exists %I', constraint_row.conname);
  end loop;
end $$;

alter table if exists public.profiles
  drop constraint if exists profiles_bio_max_length;

alter table if exists public.profiles
  add constraint profiles_bio_max_length
  check (bio is null or char_length(bio) <= 280);

NOTIFY pgrst, 'reload schema';


-- ============================================================
-- MIGRACIÓN 0023: SEGURIDAD DEL FEED Y AUTORÍA
-- ============================================================
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


-- ============================================================
-- OPCIONAL: convertir cuentas en administradores (sustituye UUID si hace falta)
-- ============================================================
-- update public.profiles set is_admin = true where email in (
--   'tragos.sociales.oficial@gmail.com',
--   'camacaro.1516@gmail.com'
-- );


-- ============================================================
-- MIGRACIÓN 0024: BORRADO SEGURO POR RPC
-- ============================================================
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


-- ============================================================
-- MIGRACIÓN 0025: IDENTIDAD REAL DEL AUTOR OFICIAL
-- ============================================================
-- Tragos Sociales: identidad real del creador en publicaciones oficiales.
-- Ejecutar después de las migraciones 0021-0024.

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
      nullif(trim(p.email), ''),
      nullif(trim(u.email), ''),
      'Tragos Sociales Oficial'
    ) as name,
    nullif(trim(p.username), '') as username,
    nullif(trim(p.avatar_url), '') as avatar_url
  from unnest(coalesce(p_post_ids, '{}'::uuid[])) requested(id)
  join public.official_posts op on op.created_by = requested.id and op.id = any(coalesce(p_post_ids, '{}'::uuid[]))
  join auth.users u on u.id = op.created_by
  left join public.profiles p on p.id = u.id
  where op.deleted_at is null
  group by u.id, p.name, p.username, p.email, u.email, p.avatar_url;
$$;

revoke all on function public.get_official_post_authors(uuid[]) from public;
grant execute on function public.get_official_post_authors(uuid[]) to authenticated;

notify pgrst, 'reload schema';


-- ============================================================
-- MIGRACIÓN 0026: ZONA CALIENTE Y PRIVACIDAD DEL MAPA
-- ============================================================
-- Tragos Sociales: zona caliente agregada y marcadores privados del mapa.
-- El contador incluye todos los brindis activos cercanos; los marcadores individuales
-- solo incluyen amistades aceptadas o perfiles públicos.

create or replace function public.get_map_activity()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  activity_count integer := 0;
  center_lat double precision;
  center_lng double precision;
  visible_markers jsonb := '[]'::jsonb;
begin
  select count(*)::integer,
         round(avg(v.latitude)::numeric, 3)::double precision,
         round(avg(v.longitude)::numeric, 3)::double precision
    into activity_count, center_lat, center_lng
    from public.checkins c
    join public.venues v on v.id = c.venue_id
   where c.status = 'active'
     and c.user_id <> auth.uid()
     and v.latitude is not null
     and v.longitude is not null;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'user_id', c.user_id,
    'name', coalesce(nullif(trim(p.name), ''), nullif(trim(p.username), ''), 'Amigo'),
    'venue_name', v.name,
    'latitude', v.latitude,
    'longitude', v.longitude,
    'created_at', c.created_at
  ) order by c.created_at desc), '[]'::jsonb)
    into visible_markers
    from public.checkins c
    join public.venues v on v.id = c.venue_id
    join public.profiles p on p.id = c.user_id
   where c.status = 'active'
     and c.user_id <> auth.uid()
     and v.latitude is not null
     and v.longitude is not null
     and (
       coalesce(p.is_public, false) = true
       or exists (
         select 1
           from public.friendships f
          where f.status = 'accepted'
            and ((f.user_id = auth.uid() and f.friend_id = c.user_id)
              or (f.friend_id = auth.uid() and f.user_id = c.user_id))
       )
     );

  return jsonb_build_object(
    'total_count', activity_count,
    'center_latitude', center_lat,
    'center_longitude', center_lng,
    'markers', visible_markers
  );
end;
$$;

revoke all on function public.get_map_activity() from public;
grant execute on function public.get_map_activity() to authenticated;

notify pgrst, 'reload schema';


-- ============================================================
-- MIGRACIÓN 0027: BRINDIS ACTIVO TTL Y CLUSTERING
-- ============================================================
-- Tragos Sociales: Brindis Activo con TTL de 30 minutos y zona caliente por densidad.
-- Ejecutar después de la migración 0026.

alter table public.checkins
  add column if not exists is_active boolean not null default true;

alter table public.checkins
  alter column expires_at set default (now() + interval '30 minutes');

update public.checkins
   set is_active = false
 where status <> 'active'
    or (expires_at is not null and expires_at <= now());

update public.checkins
   set expires_at = created_at + interval '30 minutes'
 where status = 'active'
   and is_active = true
   and expires_at is null;

create index if not exists checkins_active_ttl_idx
  on public.checkins (status, is_active, expires_at, venue_id)
  where status = 'active' and is_active = true;

create or replace function public.expire_stale_checkins()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer;
begin
  update public.checkins
     set is_active = false,
         status = 'ended'
   where status = 'active'
     and is_active = true
     and expires_at is not null
     and expires_at <= now();
  get diagnostics changed = row_count;
  return changed;
end;
$$;

grant execute on function public.expire_stale_checkins() to authenticated;

drop function if exists public.deactivate_my_checkin(bigint);
create function public.deactivate_my_checkin(p_checkin_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  changed boolean;
begin
  update public.checkins
     set is_active = false,
         status = 'ended',
         expires_at = least(coalesce(expires_at, now()), now())
   where id = p_checkin_id
     and user_id = auth.uid()
     and status = 'active';
  changed := found;
  return changed;
end;
$$;

grant execute on function public.deactivate_my_checkin(bigint) to authenticated;

create or replace function public.get_map_activity()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  cluster_venue_id bigint;
  cluster_lat double precision;
  cluster_lng double precision;
  activity_count integer := 0;
  visible_markers jsonb := '[]'::jsonb;
begin
  perform public.expire_stale_checkins();

  -- Cada local geocodificado funciona como geofence de 50 metros.
  -- Se elige el grupo más concurrido y no se mezclan locales distantes.
  select
    v.id,
    v.latitude,
    v.longitude,
    count(*)::integer
  into cluster_venue_id, cluster_lat, cluster_lng, activity_count
  from public.checkins c
  join public.venues v on v.id = c.venue_id
  where c.status = 'active'
    and c.is_active = true
    and c.expires_at > now()
    and c.user_id <> auth.uid()
    and v.latitude is not null
    and v.longitude is not null
  group by v.id, v.latitude, v.longitude
  having count(*) >= 3
  order by count(*) desc, max(c.created_at) desc
  limit 1;

  if cluster_venue_id is null then
    return jsonb_build_object(
      'total_count', 0,
      'center_latitude', null,
      'center_longitude', null,
      'markers', '[]'::jsonb
    );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'user_id', c.user_id,
        'name', coalesce(nullif(trim(p.name), ''), nullif(trim(p.username), ''), 'Amigo'),
        'venue_name', v.name,
        'latitude', v.latitude,
        'longitude', v.longitude,
        'created_at', c.created_at
      ) order by c.created_at desc
    ),
    '[]'::jsonb
  )
  into visible_markers
  from public.checkins c
  join public.venues v on v.id = c.venue_id
  join public.profiles p on p.id = c.user_id
  where c.venue_id = cluster_venue_id
    and c.status = 'active'
    and c.is_active = true
    and c.expires_at > now()
    and c.user_id <> auth.uid()
    and (
      coalesce(p.is_public, false) = true
      or exists (
        select 1
        from public.friendships f
        where f.status = 'accepted'
          and ((f.user_id = auth.uid() and f.friend_id = c.user_id)
            or (f.friend_id = auth.uid() and f.user_id = c.user_id))
      )
    );

  return jsonb_build_object(
    'total_count', activity_count,
    'center_latitude', cluster_lat,
    'center_longitude', cluster_lng,
    'markers', visible_markers
  );
end;
$$;

revoke all on function public.get_map_activity() from public;
grant execute on function public.get_map_activity() to authenticated;

notify pgrst, 'reload schema';
