# Sistema de notificaciones de Junta2

## 1. Resumen ejecutivo

Junta2 utiliza un flujo basado en actividades de Supabase. Una acción de usuario no envía directamente un push desde el teléfono. Primero se crea una fila en `public.activities`; después un trigger la coloca en `public.notification_outbox` y dispara inmediatamente `notify-activity` mediante `pg_net`; finalmente la función envía la alerta a Expo Push Service y/o directamente a Firebase Cloud Messaging (FCM). `pg_cron` permanece como fallback para reintentos y recuperación.

Este diseño desacopla la aplicación del proveedor de push, permite reintentos y evita que una caída temporal del proveedor haga perder inmediatamente una notificación.

Estado verificado en Supabase durante esta revisión:

- Tokens push registrados: **5**.
- Elementos pendientes en la outbox: **0**.
- Elementos en procesamiento: **0**.
- Elementos fallidos: **0**.
- Elementos despachados históricamente: **170**.
- Edge Function `notify-activity`: activa, versión 55.
- Edge Function `notification-action`: activa, versión 12.

## 2. Flujo completo, de principio a fin

### Paso A: el usuario realiza una acción

Ejemplos: inicia un brindis, envía un mensaje privado, manda una solicitud de amistad, reacciona a un Estado o alguien responde a un comentario.

### Paso B: Supabase crea una actividad

Los triggers de la base de datos escriben en `public.activities`. Cada actividad contiene, según el caso:

- `recipient_id`: destinatario.
- `actor_id`: persona que originó la acción.
- `type`: tipo de notificación.
- `message`: texto base.
- Identificadores de navegación como `friendship_id`, `direct_message_id`, `story_id`, `official_post_id`, `comment_id` o `checkin_id`.
- `read_at`: fecha de lectura, cuando aplica.

### Paso C: se coloca la actividad en la outbox y se dispara en el acto

El trigger `activities_push_after_insert` llama a `enqueue_activity_push()`. La actividad se copia a `notification_outbox` con estado `queued` y el mismo trigger llama a `net.http_post` con el `outbox_id` recién creado. La llamada a `pg_net` es asíncrona, por lo que no bloquea la creación de la actividad; el objetivo es que `notify-activity` empiece el envío en milisegundos.

La outbox tiene estos estados:

- `queued`: esperando procesamiento.
- `processing`: un worker la está procesando.
- `dispatched`: la función de envío fue llamada correctamente.
- `failed`: agotó los reintentos permitidos.

El worker procesa hasta 25 elementos por ciclo y corre cada minuto mediante `pg_cron`. Se utiliza cuando `pg_net` no pudo programar la llamada o cuando el envío inmediato dejó la fila en `queued`. Usa reintentos exponenciales, hasta 8 intentos, con espera progresiva que puede llegar a 15 minutos.

### Paso D: `notify-activity` valida y prepara el envío

Antes de enviar, la Edge Function:

1. Valida que existan actor, destinatario y tipo soportado.
2. Evita enviar una notificación al propio autor.
3. Consulta `is_blocked_between` y cancela el envío si existe un bloqueo.
4. Comprueba la audiencia del brindis cuando la actividad es `check_in` o `check_out`.
5. Consulta todos los dispositivos registrados del destinatario.
6. Obtiene nombre, usuario y foto de perfil del actor.
7. Deduplica el envío por actividad y dispositivo usando `activity_push_deliveries`.
8. Genera tokens temporales para acciones interactivas.
9. Envía por Expo o FCM según el dispositivo y el tipo de notificación.
10. Elimina tokens que respondan `DeviceNotRegistered`.

## 3. Tipos de notificación disponibles

### 3.1 Brindis iniciado: `check_in`

Se genera cuando un usuario inicia un brindis activo.

**Destinatarios:** amigos aceptados que estén dentro de la audiencia seleccionada.

**No se envía:**

- Al propio usuario.
- A usuarios bloqueados.
- A personas fuera de la audiencia del brindis.
- Si el brindis ya terminó o expiró.

**Texto normal:**

- Si existe un local administrado válido: `Nombre está tomando algo en Nombre del local`.
- Si no hay un local comercial válido: `Nombre está tomando algo cerca de tu zona`.

La función evita presentar una ubicación GPS genérica como si fuera un local real.

**Acciones disponibles desde la alerta:**

- `Salud 🍻`.
- `Voy en camino 🚗`.

Estas acciones envían un mensaje privado de respuesta al autor del brindis mediante `notification-action`.

**Al tocar la notificación:** si existe `venueId`, abre el Mapa centrado en el pin administrado; si no existe, abre el perfil del amigo como fallback.

### 3.2 Brindis terminado: `check_out`

Se genera cuando un brindis pasa de activo a terminado.

**Destinatarios:** los amigos que podían ver ese brindis.

**Texto:** indica que la persona terminó su visita y conserva el contexto del local o zona.

La actividad de salida no tiene, actualmente, botones rápidos propios.

### 3.3 Solicitud de amistad: `friend_request`

Se genera al insertar una solicitud pendiente.

**Título:** nombre de la persona que envió la solicitud.

**Texto:** `Te envió una solicitud de amistad`.

**Acciones disponibles:**

- `Aceptar`.
- `Rechazar`.

**Aceptar:** cambia la relación a `accepted`.

**Rechazar:** elimina la solicitud pendiente. Esto permite que el remitente pueda enviar otra solicitud en el futuro.

**Bloquear:** es una acción diferente y se realiza desde el perfil. El bloqueo permanece en la tabla de amistades y evita búsquedas, nuevas solicitudes y mensajes.

**Al tocar el cuerpo de la notificación:** abre directamente el perfil de la persona que envió la solicitud, no una pantalla genérica de Amigos.

Al aceptar o rechazar desde la alerta, la notificación se descarta automáticamente del centro de notificaciones.

### 3.4 Mensaje privado: `direct_message`

Se genera automáticamente después de insertar un registro en `direct_messages`.

**Título:** nombre de quien envió el mensaje.

**Cuerpo:** texto del mensaje.

**Canal Android:** `direct-messages-v1`, con importancia máxima, sonido, vibración y prioridad alta.

**Acción disponible:**

- `Responder`, con campo de texto directamente desde la notificación.

La respuesta se procesa mediante `notification-action` y se protege con `client_message_id` para evitar mensajes duplicados si el sistema reintenta la operación.

**Comportamiento dentro de la app:** si el usuario ya está dentro del chat activo con esa persona, el handler local no muestra banner ni agrega otra alerta visible. El mensaje sigue llegando al chat en tiempo real.

**Al tocar la alerta:** abre `/chat/{peerId}` pasando nombre y foto del remitente en los parámetros iniciales; así el encabezado aparece desde el primer frame y luego se reconcilia con Supabase.

### 3.5 Reacción a un Estado: `reaction_story`

Se genera cuando otra persona reacciona a un Estado.

**Texto:** `Nombre reaccionó a tu Estado [emoji]`.

**Acciones disponibles:**

- `🍺`.
- `🔥`.
- `🍻`.
- `❤️`.

La reacción elegida se guarda en la actividad mediante `saveNotificationReaction`.

**Al tocar la alerta:** abre Amigos en la subpestaña Estados con `storyId` y `storyUserId`; el visor embebido abre la diapositiva correspondiente usando el caché compartido.

La base de datos actualiza la misma actividad de reacción cuando el usuario cambia el emoji, en vez de crear una fila duplicada para cada cambio.

### 3.6 Nuevo Estado: `story_new`

Se genera cuando un usuario publica un Estado vigente y visible para sus amigos.

**Destinatarios:** amigos aceptados a los que la privacidad del Estado permite verlo.

**Texto:** `Nombre acaba de subir una historia nueva`.

**Al tocar la alerta:** abre Amigos en la subpestaña Estados con el identificador del Estado y del usuario que lo publicó.

La actividad se deduplica por Estado y destinatario.

### 3.7 Publicación oficial: `official_post`

La función de envío soporta publicaciones de Eventos creadas por la cuenta oficial.

**Título:** `Junta2_Oficial`.

**Texto:** el mensaje de la publicación o un texto predeterminado indicando que la cuenta oficial publicó contenido nuevo en Eventos.

**Al tocar la alerta:** abre Eventos y puede incluir `postId` para enfocar la publicación correspondiente.

El acceso de creación y edición de publicaciones oficiales está restringido al administrador.

### 3.8 Respuesta a comentario: `comment_reply`

Se genera cuando alguien responde a un comentario existente de otra persona.

**Texto:** `Nombre respondió a tu comentario`.

No se crea cuando el comentario no es una respuesta, cuando el autor responde a su propio comentario o cuando la actividad no cumple la relación padre-hijo.

**Al tocar la alerta:** abre Eventos con el `postId` asociado.

Actualmente esta categoría no tiene botones interactivos rápidos; su acción principal es la navegación al contenido.

## 4. Acciones disponibles desde las notificaciones

| Tipo | Acción | Resultado |
|---|---|---|
| Mensaje privado | Responder | Inserta un mensaje en el chat sin abrir manualmente la app |
| Solicitud | Aceptar | Cambia la amistad a aceptada |
| Solicitud | Rechazar | Elimina la solicitud y permite volver a solicitar |
| Brindis | Salud 🍻 | Envía una respuesta rápida al autor |
| Brindis | Voy en camino 🚗 | Envía una respuesta rápida al autor |
| Reacción a Estado | 🍺 / 🔥 / 🍻 / ❤️ | Guarda la reacción en la actividad |
| Todas | Tocar cuerpo | Navega al destino relacionado |

Las acciones que modifican datos usan un token temporal almacenado como hash en `notification_action_tokens`. La Edge Function lo reclama con un lease, ejecuta la operación y luego lo marca como usado. Esto evita repetir una acción si Android entrega dos veces el mismo evento.

## 5. Registro de dispositivos y permisos

Al iniciar sesión y también cuando la app vuelve al primer plano, el cliente:

1. Crea o recupera un `installation_id` persistente.
2. Crea los canales Android.
3. Registra las categorías de acciones.
4. Solicita permiso de notificaciones.
5. Obtiene el Expo Push Token.
6. Intenta obtener también el token nativo FCM.
7. Guarda ambos en `public.push_tokens`.
8. Guarda un diagnóstico local de la etapa que falló, si algo sale mal.

El registro se hace por instalación y no solo por usuario, por lo que un usuario puede recibir alertas en varios dispositivos.

Una instalación puede tener:

- Token Expo.
- Token FCM.
- Plataforma Android o iOS.
- `installation_id` estable.
- Fecha de última actualización.

En web, simuladores y Expo Go no se debe esperar el mismo comportamiento de push nativo que en una build instalada en un dispositivo físico.

## 6. Canales, sonido y prioridad

### Android

- `friend-activity-v4`: actividad social, solicitudes, Estados y brindis.
- `direct-messages-v1`: mensajes privados.

Ambos canales usan prioridad máxima, sonido predeterminado y vibración. El canal de chat está separado para poder controlar su comportamiento de forma independiente.

Android conserva la configuración del canal creada por el usuario. Si el usuario desactiva sonido o banners desde los ajustes del sistema, la app no puede forzarlo desde JavaScript.

### iOS

iOS utiliza las categorías de acciones registradas por `expo-notifications`. La apariencia exacta de botones, imagen de perfil, agrupación y banner depende también del sistema operativo y de la configuración del usuario.

## 7. Foto de perfil en la notificación

El backend incluye `avatarUrl` tanto en la carga de Expo como en la carga nativa de FCM cuando existe foto de perfil.

La foto se entrega como imagen enriquecida para Expo y como `image` en FCM. La forma exacta de mostrarla —circular, cuadrada o como icono del remitente— depende del renderer de Android/iOS y de la build nativa. El payload sí contiene la identidad visual del remitente.

## 8. Deduplicación

Hay varias capas de protección:

1. La outbox tiene una fila única por `activity_id`.
2. `activity_push_deliveries` evita enviar la misma actividad dos veces al mismo dispositivo.
3. Los mensajes privados pendientes del mismo remitente se agrupan y no crean banners consecutivos innecesarios.
4. Las solicitudes de amistad actualizan la actividad existente cuando corresponde.
5. Las reacciones de un mismo usuario sobre un Estado actualizan la actividad existente.
6. Las respuestas desde una notificación usan `client_message_id`.
7. El cliente mantiene un conjunto temporal de respuestas ya procesadas.

## 9. Qué sucede con la app abierta, en segundo plano o cerrada

### App abierta

- La app puede mostrar banner y sonido si la notificación no corresponde al chat actualmente abierto.
- En el chat activo, se suprime el banner para evitar duplicación visual.
- Realtime actualiza el contenido interno de la pantalla.

### App en segundo plano

- Android puede mostrar banner, sonido, vibración y botones según el canal.
- El usuario puede aceptar/rechazar solicitudes o responder un chat desde la notificación si el sistema lo permite.

### App cerrada

- El envío depende del token válido, permisos del sistema, configuración de Firebase/Expo y conectividad del dispositivo.
- Las acciones interactivas se procesan por la Edge Function `notification-action`.
- Al tocar el cuerpo, la app se abre y resuelve la ruta con los datos incluidos en el payload.

## 10. Seguridad y privacidad

- Las actividades se entregan al destinatario indicado.
- Los bloqueos se validan en backend antes de enviar.
- Los brindis respetan la audiencia seleccionada.
- Las respuestas de notificación requieren tokens temporales.
- `notification_action_tokens` no expone el token original; se almacena su hash.
- La outbox no está disponible para usuarios anónimos o autenticados normales; está reservada al procesamiento de servicio.
- Los tokens push se registran por usuario e instalación.

## 11. Diagnóstico cuando una notificación no llega

Revisar en este orden:

1. El usuario tiene permiso de notificaciones en Android/iOS.
2. Está usando una build nativa instalada, no Expo Go ni web.
3. `push_tokens` tiene una fila para ese usuario y esa instalación.
4. El token tiene `expo_push_token` y, en Android, preferiblemente `fcm_token`.
5. La actividad se creó en `activities`.
6. La actividad entró en `notification_outbox`.
7. La outbox pasó a `dispatched` y no a `failed`.
8. `is_blocked_between` no está bloqueando la entrega.
9. El usuario está dentro de la audiencia del brindis.
10. El canal de Android no está silenciado por el usuario.
11. Expo/FCM no marcó el token como `DeviceNotRegistered`.
12. La aplicación no está suprimiendo el banner por estar dentro del chat activo.

El cliente guarda un diagnóstico local por usuario con etapas `permission`, `expo_token`, `auth`, `supabase`, `saved` y `native`.

## 12. Diferencia entre actividad interna y push

Una fila en `activities` no garantiza que aparezca un banner. La actividad puede existir aunque:

- El destinatario no tenga token.
- No tenga permiso.
- El token esté caducado.
- El usuario esté bloqueado.
- El brindis esté fuera de audiencia.
- La alerta esté suprimida porque el chat está abierto.
- El proveedor haya rechazado el envío.

Por eso el diagnóstico correcto siempre debe seguir actividad → outbox → tokens → proveedor → dispositivo.

## 13. Estado actual y observación importante

La base de datos tiene productores activos para brindis, solicitudes, mensajes, respuestas a comentarios, reacciones a Estados y nuevos Estados. El procesador `notify-activity` soporta además publicaciones oficiales.

En el conteo actual de actividades de Supabase aparecen principalmente:

- `check_in`: 966.
- `official_post`: 894.
- `check_out`: 111.
- `direct_message`: 43.
- `reaction_story`: 5.
- `friend_request`: 4.

En esa consulta no aparecieron filas actuales de `story_new` ni `comment_reply`, aunque sus triggers y el procesador están preparados. Esto significa que el flujo está implementado, pero no se puede concluir que haya sido ejercitado recientemente solo por el conteo histórico.

## 14. Archivos principales relacionados

- `lib/push-notifications.ts`: permisos, tokens, canales, categorías y acciones del cliente.
- `app/_layout.tsx`: recepción de respuestas y navegación.
- `lib/notification-routing.ts`: destino de cada alerta.
- `supabase/functions/notify-activity/index.ts`: validación, deduplicación y envío.
- `supabase/functions/notification-action/index.ts`: aceptar, rechazar, responder y acciones rápidas.
- `supabase/migrations/0055_notification_outbox.sql`: outbox y `pg_cron`.
- `supabase/migrations/0053_push_token_installations.sql`: soporte multi-dispositivo.
- `supabase/migrations/0030_notification_action_leases.sql`: tokens temporales y respuestas a comentarios.
- `supabase/migrations/0045_notification_chat_link.sql`: conexión de mensajes con actividades y navegación al chat.

## 15. Resumen corto para soporte

Cuando alguien pregunta “¿por qué no llegó?”, la respuesta técnica se encuentra siguiendo cuatro preguntas:

1. ¿Se creó la actividad?
2. ¿Entró y salió de la outbox?
3. ¿Había token válido para la instalación?
4. ¿El sistema operativo permitió mostrarla?

La arquitectura actual ya contempla multi-dispositivo, deduplicación, reintentos, bloqueo, audiencia de brindis, acciones desde la alerta, respuesta de chat y navegación profunda.
