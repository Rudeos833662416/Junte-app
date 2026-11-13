# Junta2 — Locales, mapa y collage por tema

## Estado
Borrador para revisión adversarial. No implementar ni desplegar hasta resolver las decisiones abiertas.

## Objetivo
Actualizar locales y mapa en tiempo real, mejorar el acabado visual nocturno y separar el collage de Home por tema claro/oscuro con doble buffer y publicación explícita.

## Hechos verificados
- `components/social-map-screen.tsx` ya suscribe `venues` a Supabase Realtime para `INSERT/UPDATE/DELETE` mediante `event: "*"`, pero la carga está limitada a 300 filas y comparte canal con check-ins.
- El estilo `CLEAN_MAP_STYLE` todavía pinta `administrative.locality` en naranja; eso contradice el requisito de etiquetas neutras.
- `components/home-collage.tsx` usa dos capas durante el fundido, pero cambia `activeGroup` y reinicia la opacidad al terminar; no hay un buffer estable con roles alternos durante todo el ciclo.
- `home_collage_images` no tiene columna de tema ni estado de publicación.
- `home_collage_settings` es global, se actualiza directamente y se transmite por Realtime; no existe estado draft/publicado.
- `HomeCollageAdmin` publica inmediatamente imágenes, orden, visibilidad y configuración.

## Alcance
1. Mapa: corregir etiquetas de zonas a gris/blanco neutro, conservar POI ocultos, filtros y pines propios; robustecer actualización local y Realtime de venues.
2. Perfil/mapa: conservar la portada, tarjetas, preview card, mini mapa y navegación existentes.
3. Collage: `theme = light|dark`, colecciones independientes, doble buffer real, cuatro celdas estables, precarga y cleanup.
4. Administración: selector de tema, operaciones de draft locales/remotas, preview del admin y botón explícito Publicar.
5. Supabase: RLS, Realtime y modelo de publicación sin exponer borradores a usuarios normales.

## No objetivos
- No cambiar el flujo de autenticación ni el sistema general de roles.
- No añadir editor de color libre tipo picker si el contrato actual solo soporta hex validado; puede quedar como presets o input validado en una fase separada.
- No convertir eventos en una entidad geoespacial nueva en esta fase.

## Diseño propuesto
### Venues
- Mantener la suscripción Realtime existente y extraer un handler idempotente por `INSERT`, `UPDATE` y `DELETE` para actualizar el estado local sin esperar un refetch.
- Hacer refetch posterior como reconciliación, con debounce/coalescencia para ráfagas.
- Mantener la consulta limitada y documentar paginación si el dataset supera el límite.
- Cambiar `administrative.locality` y etiquetas equivalentes a gris neutro.

### Collage
- Añadir `theme text not null check (theme in ('light','dark'))` a imágenes.
- Añadir `is_published boolean not null default true` y `published_at`, o una tabla/versionado separado si la revisión demuestra que el rollback exige snapshots.
- Usuarios normales solo leen `is_active = true and is_published = true and theme = current_theme`.
- Admin lee/escribe drafts de su tema.
- Configuración debe tener filas por tema y estado publicado/draft; publicar imágenes y settings debe ser una operación atómica server-side para evitar estados mezclados.
- El cliente público suscribe solo cambios publicados del tema activo.
- El collage mantiene `visibleLayer` y `incomingLayer` con grupos ya precargados; anima opacidad de la capa entrante de 0 a 1 durante 3000–3500ms, espera a que termine, intercambia roles sin desmontar la capa recién visible y solo entonces prepara la siguiente.
- Si cambia Realtime durante un fundido, cancelar de forma segura, conservar la capa visible y reconciliar al siguiente ciclo.

## Permisos y consistencia
- El botón Publicar debe verificar `public.is_admin()` en servidor.
- No confiar en ocultar controles en UI.
- Una publicación debe actualizar settings e imágenes de forma coherente; preferido: función/RPC `publish_home_collage(theme, payload)` con validación de admin y transacción.
- La eliminación de Storage debe ser posterior y tolerante a reintentos; no borrar archivos antes de confirmar el cambio de base de datos.

## Pruebas de aceptación
- Mapa: etiquetas de localidad neutras; un INSERT aparece sin reiniciar; UPDATE reemplaza el pin; DELETE lo elimina; ráfagas no crean duplicados.
- Collage: claro y oscuro nunca mezclan imágenes; cuatro celdas siempre ocupadas; no hay salto visual al finalizar fundido; un cambio Realtime no deja una capa antigua visible.
- Admin: cambios de draft no son visibles para otro dispositivo; preview local refleja draft; Publicar sincroniza con Realtime; cancelar no publica; publicación requiere admin.
- Seguridad: políticas públicas no devuelven drafts; Storage y tablas mantienen RLS.
- Verificación: TypeScript, suite Vitest, diff check y build EAS cuando la implementación pase gates.

## Decisiones abiertas que requieren confirmación
1. ¿Se acepta una migración con tabla de versiones/snapshots para hacer publicación atómica y rollback, o se prefiere la mínima opción `is_published` sobre las tablas actuales?
2. ¿El borrador debe persistir en Supabase para continuar desde otro dispositivo del mismo admin, o basta con persistencia en el dispositivo actual?
3. ¿La configuración de claro/oscuro debe tener valores independientes completos (opacidad, velo, brillo, contraste y duración), o solo imágenes separadas con settings globales?
