# Qué hacer ahora en Supabase

## Paso actual: ejecutar las tablas

1. Abre tu proyecto de Supabase.
2. En el menú izquierdo entra en **SQL Editor**.
3. Pulsa **New query**.
4. En el proyecto SocialSip, abre el archivo `supabase/migrations/0001_socialsip.sql`.
5. Copia todo su contenido y pégalo en la ventana **SQL Editor** de Supabase.
6. Pulsa **Run**.
7. Si termina correctamente, abre **Table Editor** y confirma que aparecen `profiles`, `venues`, `friendships`, `checkins` y `stories`.
8. En **Storage** debe aparecer un bucket llamado `stories`.

No pegues este SQL en la pantalla de API Keys. API Keys solo sirve para copiar la URL y la Publishable key. El SQL se ejecuta únicamente en **SQL Editor**.

## Variables ya configuradas

- `SUPABASE_URL`: `https://cymhbwgxmezrwofkbdqz.supabase.co`
- `SUPABASE_ANON_KEY`: la Publishable key que empieza por `sb_publishable_`

La prueba automática de conexión a Supabase ya pasó correctamente. La aplicación ya tiene instalado `@supabase/supabase-js`, un cliente persistente en `lib/supabase.ts`, un hook de sesión Supabase en `hooks/use-auth.ts` y una pantalla de login con registro e inicio de sesión por correo en `app/login.tsx`.

## Después de pulsar Run

Responde `SQL terminado`. Entonces conectaré las consultas de SocialSip a las tablas de Supabase y sustituiré las llamadas tRPC de check-ins e Historias.
