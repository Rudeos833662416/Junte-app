# Despliegue listo de notificaciones push

## 1. Ejecutar las migraciones

En Supabase abre **SQL Editor → New query**, pega el contenido de `SUPABASE_PUSH_MIGRATIONS_READY.sql` y pulsa **Run**. Debe terminar con `Success`.

## 2. Vincular la carpeta con Supabase

Desde la raíz del proyecto ejecuta:

```bash
cd /ruta/a/copia-de-tragos-sociales
npx supabase login
npx supabase link --project-ref cymhbwgxmezrwofkbdqz
```

Si el proyecto está en otra cuenta, usa el `project-ref` que aparece en la URL de tu proyecto Supabase.

## 3. Desplegar la Edge Function

```bash
npx supabase functions deploy notify-activity --no-verify-jwt
```

## 4. Guardar la service role key de forma segura

No la pongas en la aplicación ni en el código. En la misma terminal:

```bash
read -s SUPABASE_SERVICE_ROLE_KEY
printf '\n'
npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY"
unset SUPABASE_SERVICE_ROLE_KEY
```

Cuando `read` quede esperando, pega la **service_role key** de Supabase y presiona Enter. No aparecerá en pantalla.

## 5. Crear el Database Webhook

En el panel de Supabase entra en **Database → Webhooks → Create a new webhook** y usa estos valores:

| Campo | Valor |
|---|---|
| Name | `notify-activity` |
| Table | `public.activities` |
| Events | Solo `Insert` |
| Type | Supabase Edge Function o HTTP Request |
| URL | `https://cymhbwgxmezrwofkbdqz.supabase.co/functions/v1/notify-activity` |
| HTTP method | `POST` |
| Headers | `Content-Type: application/json` |

Guarda el webhook y actívalo. No agregues la service role key como header del webhook; la función la lee desde el secreto interno de Supabase.

## 6. Generar y probar el APK

Después de cambiar el código nativo de notificaciones, genera un APK nuevo desde el checkpoint actual. En dos teléfonos físicos, inicia sesión con dos cuentas amigas, acepta los permisos de notificaciones y deja cerrada la app del segundo teléfono. Haz check-in desde el primer teléfono. El segundo debe recibir un aviso emergente con el nombre del usuario y el texto **“Está tomando algo”**. Para una solicitud de amistad debe aparecer **Aceptar** y **Rechazar**.

La prueba no funciona desde el navegador ni desde Expo Go. La Edge Function y el webhook deben estar activos en el mismo proyecto Supabase que usa el APK.
