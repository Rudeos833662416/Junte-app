# Notificaciones push de actividad

La aplicación ya registra el token Expo del usuario autenticado, configura la categoría `FRIEND_ACTIVITY` y permite reaccionar desde la notificación con 🍺, 🔥, 🍻 o ❤️. La entrega cuando la aplicación está cerrada requiere ejecutar la Edge Function incluida en `supabase/functions/notify-activity`.

## Migraciones

Ejecuta en Supabase, en este orden si todavía no lo hiciste:

```text
supabase/migrations/0013_media_storage_repair.sql
supabase/migrations/0014_push_tokens_activity_actions.sql
```

La segunda migración crea `push_tokens` y permite borrar actividades propias. No coloques la `service_role` key dentro de la aplicación móvil.

## Edge Function

Desde la carpeta del proyecto Supabase, despliega la función:

```bash
supabase functions deploy notify-activity --no-verify-jwt
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
```

La función utiliza las variables administradas `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` para leer tokens y envía el mensaje al servicio de Expo. La service role key debe permanecer exclusivamente en Supabase.

## Webhook

En el panel de Supabase crea un Database Webhook para la tabla `public.activities`, evento `INSERT`, que llame a la URL de la función:

```text
https://<tu-proyecto>.supabase.co/functions/v1/notify-activity
```

Usa solamente eventos `INSERT`; las actividades ya se generan automáticamente mediante el trigger de check-ins. El webhook enviará notificación para `check_in` y `check_out` y omitirá reacciones u otros tipos.

## Prueba

Instala una build nativa nueva, inicia sesión en dos teléfonos con usuarios amigos, acepta los permisos de notificaciones y realiza un check-in desde uno de ellos. El otro teléfono debe recibir la notificación aun cuando Tragos Sociales no esté abierta. Al tocar un emoji, la aplicación se abrirá y guardará la reacción en la actividad.

La entrega push no puede verificarse en el navegador ni en Expo Go. Requiere un APK o development build y la Edge Function/webhook activos en el proyecto Supabase.
