# SocialSip — Diseño de Interfaz Móvil

## Visión del producto

SocialSip es una aplicación social móvil para avisar a tus amigos cuando sales a tomar algo y descubrir en qué bar están ellos. La experiencia está diseñada para **portrait**, uso con una mano y acciones rápidas: abrir, avisar, mirar quién está cerca y unirse.

## Pantallas y funcionalidad

| Pantalla | Propósito | Contenido principal |
|---|---|---|
| **Check-in** | Avisar a los amigos dónde estás | CTA grande, estado actual, último bar y confirmación local |
| **Amigos** | Ver quién está disponible | Búsqueda, avatar de iniciales, estado, bar, hora y distancia |
| **Mapa** | Preparar la vista de cercanía | Ubicación propia, amigos cercanos, bares y controles de mapa |
| **Actividad** | Revisar novedades | Check-ins de amigos, solicitudes y limpieza del feed |
| **Perfil** | Gestionar preferencias | Estadísticas, historial, notificaciones, ubicación y privacidad |

## Flujos principales

### Check-in rápido

El usuario abre Check-in, pulsa **Hacer Check-in** y recibe feedback visual y háptico. En native se programa además una notificación local de demostración que confirma que el check-in fue compartido. La siguiente fase de producto debe sustituirla por push remoto a las amistades aceptadas.

### Encontrar amigos

El usuario entra en Amigos, filtra por nombre o pulsa **Añadir amigo**. La versión actual añade a Lucía como entrada demostrable una sola vez, mientras que la versión de producción deberá buscar usuarios reales y gestionar solicitudes en backend.

### Ver cercanía

El usuario entra en Mapa, consulta su ubicación y la de Carlos y María, y puede pulsar **Centrar mapa** o el control de privacidad para recibir feedback contextual. El paquete de mapa real debe conectarse en una siguiente iteración con permisos y consentimiento de ubicación.

## Dirección visual

SocialSip utiliza una dirección de **utilidad social nocturna cálida**. El naranja cítrico `#FF6B35` es la firma de marca; las superficies son blancas o crema en light mode y azul-negro en dark mode; los bordes son suaves y las tarjetas redondeadas. Los estados utilizan verde para presencia activa, amarillo para disponibilidad y gris para offline.

| Token | Light | Dark | Uso |
|---|---|---|---|
| Primary | `#FF6B35` | `#FF8C5A` | CTA, check-in y navegación activa |
| Background | `#FFFFFF` | `#0F1419` | Fondo general |
| Surface | `#F8F9FA` | `#1A1F26` | Tarjetas y superficies |
| Foreground | `#1A1A1A` | `#FFFFFF` | Texto principal |
| Muted | `#666666` | `#AAAAAA` | Texto secundario |
| Success | `#2ECC71` | `#27AE60` | Amigos en bar y estados activos |

La iconografía principal usa Material Icons en Android/web y SF Symbols mapeados en iOS. Se evitaron emojis como elementos centrales para elevar la percepción de producto y mantener coherencia multiplataforma. Los avatares sociales usan iniciales tipográficas dentro de círculos de color de marca.

## Decisiones de arquitectura

La primera entrega prioriza estado local y no requiere secretos externos. El scaffold Expo ya incluye `expo-notifications`, por lo que el flujo de check-in puede validar una notificación local en dispositivos nativos. Para sincronización real se deberán modelar Usuario, Amistad, CheckIn y PushToken, registrar tokens Expo/APNs/FCM y emitir eventos de check-in desde backend autenticado.

## Estado de la entrega

La interfaz de las cinco rutas, el tema, el branding, los iconos, las interacciones locales y la documentación están implementados. La sincronización remota entre cuentas, el mapa nativo y las notificaciones push a otros usuarios siguen pendientes de una fase backend explícita. Esta distinción se mantiene documentada para no presentar una demo local como un servicio social de producción.

## Revisión visual

La revisión inicial en viewport móvil de `390 × 844 px` confirmó que la navegación inferior, la jerarquía de tarjetas y el CTA naranja eran claros, pero que los emojis hacían que la app pareciera genérica. Como respuesta, se sustituyeron los elementos principales por iconos coherentes y avatares de iniciales. La siguiente validación debe comprobar el check-in, Amigos, Mapa, Actividad y Perfil tras el refinamiento.

## Checklist

- [x] Home con CTA de check-in reconocible
- [x] Amigos con estado, bar y distancia
- [x] Mapa preparado con ubicación y amigos
- [x] Actividad con check-ins y solicitudes
- [x] Perfil con estadísticas y privacidad
- [x] Iconografía coherente sin emojis principales
- [x] Logo replicado en los assets requeridos
- [ ] Validación final en dispositivo físico iOS y Android
- [ ] Backend de sincronización y push remoto

## Referencia de acciones implementadas

| Área | Acción | Resultado |
|---|---|---|
| Check-in | Hacer check-in | Cambia el estado, muestra el bar y programa confirmación local en native |
| Amigos | Buscar amigos | Filtra la lista por nombre |
| Amigos | Añadir amigo | Agrega a Lucía una sola vez |
| Actividad | Limpiar todo | Muestra el estado vacío |
| Mapa | Centrar mapa | Presenta confirmación contextual |
| Mapa | Privacidad | Informa dónde ajustar preferencias |
| Perfil | Toggles | Cambian notificaciones y ubicación |
| Perfil | Acciones | Presentan feedback contextual |

## Próximo hito

Ejecutar `pnpm check` y `pnpm lint`, revisar de nuevo las cinco rutas, actualizar `todo.md` y crear el checkpoint único de entrega. La publicación deberá realizarse desde la interfaz de gestión después del checkpoint.

> **SocialSip: avisa, encuentra y únete.**

La identidad es propia y toma únicamente el patrón general de check-in social como referencia conceptual; no se copian textos ni activos de terceros.

## Registro de continuidad

Tras la petición de continuar se completaron la copia del logo a los assets de plataforma, el vínculo del logo en `app.config.ts`, la confirmación local del check-in, la limpieza de warnings iniciales, la sustitución de emojis por iconos, la funcionalidad de añadir amigo, la limpieza del feed y el feedback contextual de mapa y perfil.

La aplicación queda preparada para la validación técnica final y para una evolución posterior hacia autenticación, ubicación consentida, sincronización remota y notificaciones entre usuarios.

## Criterios de aceptación de esta iteración

La iteración se considera lista para checkpoint cuando el proyecto compile sin errores, las cinco pestañas carguen, el logo esté presente en launcher/splash/favicon/adaptive icon, el check-in tenga feedback, la búsqueda y el alta de amigo respondan, y las pantallas no dependan de emojis para comunicar sus funciones principales.

## Nota de plataforma

La orientación se mantiene en portrait para iOS y Android. El alcance actual no incluye publicación automática ni generación manual de APK; el checkpoint habilitará la revisión y la publicación desde la interfaz de gestión.

## Fin de la fase de diseño

La base visual queda alineada con una app social elegante, minimalista y cálida para planes espontáneos entre amigos.

## Próxima acción

Validación técnica final.

## Fin

SocialSip.

## Control de cambios

- Se generó un logo propio y se replicó en los cuatro assets solicitados.
- Se configuró `appName` como `SocialSip` y se conservó `appSlug` como identificador estable.
- Se amplió el mapa de iconos antes de usar los nuevos nombres en las pantallas.
- Se documentó la diferencia entre notificación local de demo y push remoto de producción.

## Entrega preparada

La documentación queda reducida a decisiones de producto, criterios de revisión y próximos pasos técnicos, para que el proyecto sea fácil de continuar y auditar.

## Última nota

La aplicación está lista para el smoke test final.

## Fin del documento

.
