-- 0032: unificar push en public.push_tokens (fuente única)
-- user_push_devices queda vacía/deprecada; la app y notify-activity usan push_tokens.

alter table public.push_tokens
  add column if not exists fcm_token text;

create unique index if not exists push_tokens_expo_token_unique
  on public.push_tokens (expo_push_token);

create unique index if not exists push_tokens_user_platform_unique
  on public.push_tokens (user_id, platform);

create unique index if not exists push_tokens_fcm_token_unique
  on public.push_tokens (fcm_token)
  where fcm_token is not null;

insert into public.push_tokens (user_id, expo_push_token, platform, updated_at)
select
  d.user_id,
  d.expo_push_token,
  coalesce(nullif(trim(d.platform), ''), 'unknown'),
  coalesce(d.updated_at, now())
from public.user_push_devices d
where d.enabled is distinct from false
  and d.expo_push_token is not null
  and not exists (
    select 1 from public.push_tokens p
    where p.expo_push_token = d.expo_push_token
  )
on conflict (expo_push_token) do update
  set user_id = excluded.user_id,
      platform = excluded.platform,
      updated_at = greatest(public.push_tokens.updated_at, excluded.updated_at);

comment on table public.push_tokens is
  'Canonical device push tokens. Used by the app and notify-activity edge function.';
comment on table public.user_push_devices is
  'DEPRECATED: superseded by public.push_tokens. Do not write new rows here.';
