# Junta2 — Collage dinámico de Home

## Resultado
Home muestra un collage 2x2 de imágenes administrables, con crossfade lento, degradados legibles y cero interferencia con toques. Administradores pueden subir, ordenar, activar/desactivar y eliminar imágenes; los cambios se reflejan por Supabase Realtime.

## Diseño
Aesthetic: editorial social / bento collage, sobrio y premium.
Principios: imágenes decorativas de baja intensidad, contenido foreground siempre dominante, movimiento lento y silencioso, controles admin claros con targets táctiles amplios.
Paleta: tokens actuales de Junta2; velo crema en claro, velo ink en oscuro; naranja solo para acciones y estados activos.
Animación: dos grupos de 4 imágenes, crossfade 2.3 s cada 6.5 s; sin tocar layout y con `pointerEvents="none"`.

## Implementación
- `components/home-collage.tsx`: consulta pública de imágenes activas, grupos 2x2, crossfade y canal Realtime.
- `components/home-collage-admin.tsx`: modal admin con picker, upload, toggle, orden y eliminación.
- `app/(tabs)/index.tsx`: integra el collage detrás del contenido y entrada de administración solo para admins.
- `supabase/migrations/0047_home_collage.sql`: tabla, bucket, RLS, Storage policies y Realtime publication.
- `tests/home-collage.test.ts`: contrato de UI, accesibilidad y SQL.

## Seguridad
Lectura pública únicamente de filas activas y bucket público. Insert/update/delete requieren `public.is_admin()` y usuario autenticado. La UI no sustituye RLS.
