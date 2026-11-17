-- 0053: permitir varios dispositivos activos por usuario y plataforma
-- Cada instalación conserva su propio token y puede recibir notificaciones en paralelo.

alter table public.push_tokens
  add column if not exists installation_id text;

update public.push_tokens
set installation_id = 'legacy-' || id::text
where installation_id is null or btrim(installation_id) = '';

alter table public.push_tokens
  alter column installation_id set not null;

drop index if exists public.push_tokens_user_platform_unique;

create unique index if not exists push_tokens_installation_unique
  on public.push_tokens (installation_id);

comment on column public.push_tokens.installation_id is
  'Stable identifier for one app installation. Multiple installations may belong to the same user.';
