# Tragos Sociales — entrega para configurar y generar el APK

## Archivos que debes utilizar

1. `SUPABASE_TODAS_LAS_MIGRACIONES.sql`: SQL completo y corregido. Incluye `direct_messages`, `read_at`, bloqueo de reacciones propias, actividades de reacciones, trigger de mensajes directos y configuración Realtime.
2. `supabase/functions/notify-activity/index.ts`: función push actualizada. Acepta la clave existente `SERVICE_ROLE_KEY` y también el nombre estándar `SUPABASE_SERVICE_ROLE_KEY`.
3. `manus-webdev://6b0987c9`: versión del proyecto con los cambios de Estados, Chat, perfiles, notificaciones y sincronización. Después de este paquete existe un checkpoint adicional que debes seleccionar si la interfaz muestra una versión más nueva.

## Paso 1: ejecutar el SQL

Abre **Supabase → SQL Editor → New query**. Abre `SUPABASE_TODAS_LAS_MIGRACIONES.sql`, copia todo el contenido, pégalo en el editor y pulsa **Run**. No ejecutes solamente una parte. Un resultado como **Success. No rows returned** es correcto.

Si Supabase muestra un error, detén el proceso y conserva el mensaje exacto. No generes el APK hasta corregirlo.

Después ejecuta esta comprobación:

```sql
select
  to_regclass('public.direct_messages') as direct_messages,
  to_regclass('public.activities') as activities,
  to_regclass('public.stories') as stories,
  to_regclass('public.story_views') as story_views,
  to_regclass('public.story_reactions') as story_reactions,
  to_regclass('public.push_tokens') as push_tokens;
```

Todas las columnas deben mostrar el nombre de su tabla y ninguna debe mostrar `null`.

## Paso 2: desplegar la función de notificaciones

Entra en **Supabase → Edge Functions → Create a new function**. Usa exactamente este nombre, sin espacios:

```text
notify-activity
```

Abre el archivo `supabase/functions/notify-activity/index.ts`, copia todo su contenido y reemplaza el código de la función. Pulsa **Deploy**.

En **Edge Functions → Secrets**, confirma que existe:

```text
SERVICE_ROLE_KEY
```

Ese es el nombre que ya creaste. La función también acepta `SUPABASE_SERVICE_ROLE_KEY`, pero no necesitas crear otra clave si `SERVICE_ROLE_KEY` ya está guardada. Nunca pegues esa clave dentro de la aplicación móvil ni en un archivo público.

## Paso 3: configurar el webhook

En **Supabase → Database → Webhooks**, crea un webhook para la tabla `public.activities` con estos valores:

| Campo | Valor |
|---|---|
| Evento | `INSERT` |
| Tabla | `activities` |
| Esquema | `public` |
| URL | `https://TU_PROJECT_REF.supabase.co/functions/v1/notify-activity` |
| Método | `POST` |

Reemplaza `TU_PROJECT_REF` por el identificador real de tu proyecto Supabase. El SQL crea un trigger que convierte los mensajes directos en actividades, por lo que este webhook cubre Chat, reacciones, solicitudes y Brindar sin duplicar avisos.

No crees además un segundo webhook para `direct_messages` mientras esté activo el trigger incluido en el SQL; eso produciría dos notificaciones por cada mensaje. Solo se usaría un webhook directo si decides quitar el trigger de mensajes directos y cambiar la arquitectura.

## Paso 4: comprobar Realtime

En **Supabase → Database → Replication/Realtime**, confirma que estén habilitadas estas tablas:

```text
activities
checkins
direct_messages
friendships
profiles
stories
story_reactions
story_views
```

La aplicación ya tiene canales persistentes para mantener visibles los datos mientras llegan actualizaciones. El spinner se conserva únicamente dentro del visor de Estados mientras la imagen se descarga, porque es el indicador solicitado para evitar mostrar una imagen negra.

## Paso 5: generar el APK

Vuelve al proyecto en Manus y abre la versión más reciente guardada. Pulsa **Publish/Publicar**, selecciona Android y genera un APK nuevo. No reutilices el APK anterior, porque no contiene estos cambios.

La pantalla de login y la compilación web no sustituyen una prueba nativa. El mapa requiere un APK con la configuración nativa de Google Maps, y las notificaciones requieren un dispositivo Android real y permisos concedidos.

## Paso 6: prueba mínima con dos cuentas

Instala el APK en dos teléfonos Android o en dos perfiles/dispositivos separados. Con la primera cuenta, inicia sesión, concede ubicación y notificaciones, configura avatar y portada, publica un Estado PNG y pulsa **Brindar**. Con la segunda cuenta, comprueba que aparezca el avatar circular, que el anillo verde abra el Estado y que tocar la foto abra el perfil.

Después verifica que un perfil restringido muestre únicamente la información permitida y el botón Chat, que un mensaje genere el badge verde, que al abrir Chat desaparezca el badge, que una reacción o respuesta llegue al chat privado y que el visor muestre la imagen centrada sin fondo negro.

Finalmente, cierra completamente la aplicación receptora y prueba una solicitud de amistad, un mensaje de Chat y un Brindar. Comprueba las acciones **Aceptar**, **Rechazar**, **Salud 🍻** y **Voy en camino 🚗**. Si no aparecen, revisa primero permisos, token en `push_tokens`, despliegue de `notify-activity` y el webhook.

## Resultado esperado

La compilación debe salir del checkpoint más reciente, el SQL debe haber terminado sin errores, la función debe estar desplegada y el webhook debe estar activo. Solo después de esas cuatro condiciones tiene sentido evaluar el APK; si una notificación no llega antes, no es un problema que pueda resolver la compilación por sí sola.
