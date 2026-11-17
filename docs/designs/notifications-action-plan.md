# Plan de acción: notificaciones rápidas, únicas y confiables

**Proyecto:** Junta2 / Supabase `cymhbwgxmezrwofkbdqz`  
**Fecha de auditoría:** 2026-11-17  
**Alcance:** diagnóstico, implementación y verificación incremental. Fases 1 y 2 aplicadas; Fases 3–5 siguen pendientes.

## 1. Qué hace hoy el sistema

1. El cliente registra un token Expo y, cuando Android lo permite, un token FCM en `public.push_tokens`.
2. Las actividades se crean mediante triggers SQL para mensajes directos, solicitudes, check-ins, publicaciones oficiales, historias y respuestas.
3. `activities_push_after_insert` inserta una fila idempotente en `notification_outbox`; un job `pg_cron` despacha lotes hacia `notify-activity`.
4. `notify-activity` consulta tokens, reclama una fila en `activity_push_deliveries`, envía por Expo o FCM y devuelve un JSON.
5. Las acciones de respuesta usan `notification_action_tokens` con leases para evitar doble procesamiento.

## 2. Hechos verificados

### Base de datos y tokens

- El proyecto Supabase está **ACTIVE_HEALTHY**.
- Hay **6 tokens Android**; todos tienen token Expo y FCM. El token más reciente fue actualizado durante la auditoría.
- `push_tokens` tiene además `installation_id`; la migración 0053 rellenó los 6 registros existentes con identificadores `legacy-*` y creó el índice único `push_tokens_installation_unique`.
- Se mantienen índices únicos por `expo_push_token` y `fcm_token`; se eliminó el índice único `(user_id, platform)`.
- El cliente genera/recupera un identificador estable con `expo-secure-store` y hace upsert por instalación, con fallback de compatibilidad por token Expo.

### Actividades y duplicados

- En las últimas 48 horas se encontraron actividades repetidas de `check_in`: para varios pares actor/destinatario existen **4 copias** del mismo evento lógico.
- En las últimas 2 jornadas hubo actividad de `official_post`, `check_in` y `direct_message`; los posts oficiales generan una fila por usuario mediante `create_activities_from_official_post`.
- La función remota de publicaciones oficiales no excluye al autor; produce también una actividad para el propio autor. La versión desplegada de `notify-activity` sí evita enviar cuando `actor === recipient`, pero las filas innecesarias permanecen y generan carga.
- No se detectaron claves repetidas dentro de `activity_push_deliveries` en las últimas 24 horas: la deduplicación por `(delivery_key, token_id)` está evitando reenvíos idénticos cuando la función alcanza esa tabla.

### Edge Function y latencia

- `notify-activity` está activa en Supabase, versión **53**, con `verify_jwt=false`, igual que el contrato histórico requerido por `pg_net`; la función valida estrictamente el payload y usa `service_role` solo en el servidor.
- En las últimas 24 horas se registraron **217 ejecuciones** de `notify-activity` con HTTP 200.
- Latencia observada: promedio **2248 ms**, p50 **2216 ms**, p95 **3754 ms**, máximo **4199 ms**.
- Hubo eventos `Shutdown / EarlyDrop` del runtime de la función. No prueban por sí solos una pérdida, pero obligan a comprobar reintentos y a no depender de que cada llamada HTTP termine en el mismo proceso.
- El trigger SQL hace un HTTP independiente por cada actividad. Un solo post oficial puede crear decenas de actividades y disparar decenas de invocaciones simultáneas.

### Divergencia GitHub–Supabase

- La función remota fue reemplazada por la lógica versionada y ahora consulta `installation_id` y envía a todas las instalaciones elegibles, sin agrupación `latestByPlatform`.
- La función conserva el guard `self_activity`, la deduplicación por `(delivery_key, token_id)`, recibos Expo y eliminación de tokens `DeviceNotRegistered`.
- La auditoría de Fase 3 encontró dos triggers `AFTER INSERT` sobre `checkins`: `checkin_activity_after_insert` y `trigger_on_checkin_created`. El segundo llamaba a `handle_new_checkin()` e insertaba actividades sin `checkin_id`, duplicando la actividad canónica.

## 3. Diagnóstico priorizado

### Debe corregirse primero

1. **Divergencia entre código y función desplegada.** No existe una única fuente de verdad. Esto explica por qué un arreglo observado en producción puede desaparecer en el siguiente deploy.
2. **Fan-out síncrono por fila.** Cada actividad hace una llamada HTTP y cada llamada puede tardar 2–4 segundos. Esto explica retrasos cuando se generan muchas actividades juntas.
3. **Tokens inválidos sin ciclo completo de limpieza.** La limpieza está en el código local, pero no está confirmada en la función desplegada. Un token muerto puede seguir causando intentos fallidos y aumentar latencia.
4. **Modelo de un solo dispositivo por usuario y plataforma.** Un segundo Android puede reemplazar el token del primero.
5. **Duplicación en la creación de actividades de check-in.** Debe localizarse qué llamadas/trigger crean las cuatro filas equivalentes antes de ajustar únicamente el envío.

### Debería corregirse después

6. **Outbox/cola durable.** El trigger debe registrar un trabajo idempotente y devolver rápido; un worker debe procesar reintentos y backoff. No se debe enviar push directamente dentro del camino que crea la actividad.
7. **Telemetría de entrega.** Registrar por notificación lógica y token: `queued`, `claimed`, `provider_accepted`, `provider_error`, `delivered/receipt`, `invalid_token`, `skipped_reason`, latencias y proveedor.
8. **Política de agrupación para chat.** Mantener una sola alerta pendiente por conversación, pero sin perder mensajes ni crear una notificación por cada mensaje cuando el receptor está offline.

## 4. Plan por fases

### Fase 0 — Línea base y seguridad

- Crear una consulta/dashboard de salud: tokens activos por plataforma, actividades por tipo, edad de actividades no leídas, entregas por estado, p50/p95 y errores por proveedor.
- Ejecutar una prueba controlada con dos cuentas y dos dispositivos, usando un `test_run_id` fuera de la UI.
- No borrar datos históricos todavía. Solo etiquetar y medir.

**Salida:** métricas de referencia y una tabla de casos reproducibles.

### Fase 1 — Reconciliar la fuente de verdad

- Comparar el archivo versionado con la función remota.
- Elegir una única versión aprobada y desplegarla de forma reproducible.
- Añadir un contrato automatizado que compare reglas críticas: guard de auto-notificación, clave lógica, selección de tokens, limpieza de inválidos y respuesta de errores.
- Mantener autenticación cerrada en funciones de usuario; `notify-activity` debe conservar el mecanismo interno necesario para `pg_net`, pero validar estrictamente el payload y limitarlo a la ruta interna.

**Criterio:** GitHub, migración y función remota comparten la misma lógica de entrega. **Cumplido para la versión desplegada 53; la huella exacta del archivo minificado queda como mejora operativa.**

### Fase 2 — Tokens y dispositivos

- Añadir un identificador estable por instalación/dispositivo; dejar de usar `(user_id, platform)` como única identidad.
- Permitir varios dispositivos por usuario, con un token por instalación y `last_seen_at`.
- Mantener un único token por instalación; al actualizar, reemplazar solo esa instalación.
- Eliminar tokens con `DeviceNotRegistered`/errores permanentes de Expo o FCM.
- Ejecutar una limpieza controlada de tokens antiguos solo después de definir el umbral de inactividad.

**Estado:** implementación y migración aplicadas; falta la prueba controlada con dos dispositivos y definir `last_seen_at`/umbral de inactividad.

**Criterio:** dos Android del mismo usuario reciben una prueba sin pisarse; un token inválido desaparece automáticamente.

### Fase 3 — Idempotencia de actividades

- Investigar y corregir el origen de las cuatro copias de `check_in`.
- Añadir una clave de evento lógico para el check-in (`checkin_id + actor + recipient + type`) y un índice/constraint que impida copias.
- Excluir al actor antes de insertar actividades de publicaciones/check-ins cuando la regla de producto sea “no notificarme a mí mismo”.
- Conservar la deduplicación de entregas como segunda barrera, no como sustituto de la deduplicación de actividades.

**Criterio:** una acción de usuario produce una actividad lógica y como máximo una notificación por instalación elegible.

**Estado:** migración 0054 aplicada. `checkins` ahora tiene un único trigger productor, `checkin_activity_after_insert`, que ejecuta `create_checkin_activity()` con `on conflict (recipient_id, checkin_id, type) do nothing`. Las actividades históricas no se borraron; su limpieza requiere una decisión separada sobre retención.

### Fase 4 — Cola durable y rendimiento

- Sustituir el `net.http_post` directo por un registro idempotente en una outbox de notificaciones.
- Procesar la outbox con un worker Edge Function/cron con lotes pequeños, leases, reintentos limitados y backoff.
- Reservar y enviar por lote cuando sea seguro; evitar una invocación por cada destinatario en cascadas grandes.
- Mantener la respuesta del trigger SQL rápida y sin depender del proveedor externo.

**Criterio:** p95 de encolado bajo y p95 de aceptación del proveedor objetivo menor a 1 segundo en prueba normal; los picos no bloquean la creación de actividades.

**Estado:** migración 0055 aplicada. `notification_outbox` tiene estados `queued`, `processing`, `dispatched` y `failed`, contador de intentos, `next_attempt_at`, lease recuperable y clave única por actividad. El job `dispatch-tragos-sociales-notification-outbox` procesa hasta 25 filas por minuto con backoff hasta 8 intentos.

### Fase 5 — Proveedores y experiencia del cliente

- Separar métricas Expo y FCM.
- Consultar recibos después del envío con un proceso que no bloquee la respuesta del usuario.
- Validar canales Android, permisos, token de proyecto EAS y comportamiento con app abierta/cerrada.
- Mantener agrupación de chat por conversación y rutas profundas idempotentes.
- Mostrar en diagnóstico interno: permiso, token guardado, última sincronización, último error y dispositivo.

**Criterio:** prueba matriz: app abierta, segundo plano, cerrada, red lenta, token inválido, dos dispositivos, mensajes consecutivos y solicitud de amistad.

**Estado:** contratos de payload, canales, categorías, rutas y dos dispositivos están cubiertos por tests locales. Falta ejecutar la matriz física en un APK nuevo con teléfono y emulador; no se declara completada sin esa evidencia.

## 5. Orden recomendado de implementación

1. Fase 0 (observabilidad, sin cambios destructivos).
2. Fase 1 (reconciliar código desplegado).
3. Fase 2 (tokens multi-dispositivo y limpieza).
4. Fase 3 (deduplicación de actividades, empezando por check-in).
5. Fase 4 (outbox/worker).
6. Fase 5 (pruebas finales y build Android/iOS).

No recomiendo lanzar otra build antes de completar Fases 1–3; una APK nueva no corrige por sí sola los retrasos causados por el fan-out SQL ni los duplicados de actividades.

## 6. Decisiones pendientes

1. ¿Un mismo usuario debe recibir notificaciones en todos sus dispositivos o solo en el último dispositivo activo? Recomendación: todos los dispositivos activos.
2. Para publicaciones oficiales, ¿se debe notificar a todos los usuarios o solo a seguidores/usuarios con una preferencia activa? Recomendación: definir audiencia explícita antes de escalar el fan-out.
3. ¿Check-in duplicado debe consolidarse en una notificación actualizada o conservarse como historial? Recomendación: una alerta por check-in y destinatario; el historial puede conservar una sola actividad actualizada.

## 7. Riesgos y rollback

- No borrar actividades existentes durante la primera fase.
- Toda migración debe ser aditiva e idempotente.
- Mantener un flag de worker nuevo para volver temporalmente al sender actual si el proveedor falla.
- No registrar tokens, secretos FCM ni cuerpos completos de mensajes en logs.

## 8. No comprobado todavía

- No se ejecutó una notificación de prueba controlada hacia un dispositivo real durante esta auditoría.
- No se inspeccionaron recibos históricos de Expo porque la función desplegada no persiste resultados de proveedor.
- No se confirmó desde logs si cada HTTP 200 terminó en `sent > 0`; la respuesta no se almacena en una tabla de auditoría.

## 9. Revisión adversarial Goldfish

La revisión independiente encontró estos bloqueantes adicionales antes de implementar:

1. **Pérdida potencial después del claim.** `notify-activity` marca `(delivery_key, token_id)` antes de llamar a Expo/FCM. Si hay `EarlyDrop`, timeout o fallo posterior, el reintento queda bloqueado por la clave primaria. La futura outbox debe tener estados, leases, `attempt_count`, `next_attempt_at` y reintentos transitorios.
2. **Superficie pública de la Edge Function.** `notify-activity` está desplegada con `verify_jwt=false` y no muestra autenticación servidor-a-servidor adicional. Antes de exponerla más, debe añadirse un secreto interno rotado o mover la entrada a una cola/RPC no falsificable por el cliente, además de validar payload, UUID, tipo, longitud y rate limit.
3. **Multi-dispositivo incompleto.** Aunque se elimine la unicidad `(user_id, platform)`, la función desplegada agrupa tokens por plataforma y conserva solo el más reciente. Para cumplir “todos los dispositivos activos”, debe enviar a cada instalación elegible.
4. **Ruta de mensajes directos posiblemente inconsistente.** Hay migraciones que primero añaden `direct_message_id` a la actividad y otra definición posterior que no lo inserta. Hay que consolidar esa función antes de confiar en `mark_read`, reply y deep links.
5. **Rollback no definido.** El cambio de sender debe tener ownership/version de trabajo, leases expirables y una clave idempotente compartida para que el sender viejo y el nuevo no dupliquen ni pierdan envíos durante una reversión.
6. **Pruebas faltantes.** Añadir pruebas de POST no autorizado, caída entre claim y proveedor, reintento concurrente, dos dispositivos del mismo usuario, error permanente FCM, expiración de lease, bloqueo durante el envío y rollback con trabajos en vuelo.

Estos hallazgos elevan el orden de prioridad: primero seguridad y semántica de entrega; después multi-dispositivo, deduplicación de actividades y rendimiento.
