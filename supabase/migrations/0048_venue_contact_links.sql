-- 0048: enlaces públicos y contacto directo de locales.
-- Listo para copiar y ejecutar en Supabase SQL Editor.

alter table public.venues
  add column if not exists website_url text,
  add column if not exists facebook_url text,
  add column if not exists instagram_url text,
  add column if not exists tiktok_url text,
  add column if not exists whatsapp_number text,
  add column if not exists description text,
  add column if not exists address text;

comment on column public.venues.website_url is 'URL pública del sitio web del local';
comment on column public.venues.facebook_url is 'URL pública del perfil de Facebook del local';
comment on column public.venues.instagram_url is 'URL pública del perfil de Instagram del local';
comment on column public.venues.tiktok_url is 'URL pública del perfil de TikTok del local';
comment on column public.venues.whatsapp_number is 'Número de WhatsApp con código de país';

-- Los locales ya están protegidos por las policies admin de las migraciones del feed.
-- Realtime ya está habilitado para venues; se conserva idempotencia sin duplicar publicación.
