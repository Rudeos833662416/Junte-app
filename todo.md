# SocialSip - TODO

## Fase 1: Configuración Base y Autenticación
- [x] Configurar tema de color elegante y minimalista
- [x] Actualizar app.config.ts con branding de SocialSip
- [x] Crear logo y assets visuales
- [x] Implementar autenticación de usuario (Manus OAuth)
- [x] Crear pantalla de login/registro

## Fase 2: Pantalla Principal (Home - Check-in)
- [x] Diseñar e implementar home screen con botón check-in grande
- [x] Crear componente de botón check-in con animaciones
- [x] Implementar selector de bar/local
- [x] Conectar check-in con backend
- [x] Mostrar último check-in del usuario
- [x] Mostrar estado actual (online/offline)

## Fase 3: Gestión de Amigos
- [x] Crear pantalla de lista de amigos
- [x] Implementar búsqueda y filtrado de amigos
- [x] Crear pantalla para añadir amigos
- [ ] Implementar solicitudes de amistad
- [x] Mostrar estado de amigos (online/offline/en bar)
- [x] Mostrar bar actual de cada amigo
- [x] Mostrar hora del check-in

## Fase 4: Funcionalidades en Tiempo Real
- [ ] Implementar notificaciones push cuando amigos hacen check-in
- [x] Crear pantalla de actividad/notificaciones
- [ ] Implementar actualización en tiempo real de estado de amigos
- [x] Crear indicador de amigos cercanos

## Fase 5: Mapa y Ubicación
- [x] Implementar pantalla de mapa
- [x] Mostrar ubicación actual del usuario
- [ ] Mostrar ubicación de amigos en el mapa
- [x] Implementar geolocalización
- [ ] Crear marcadores de bares con amigos

## Fase 6: Perfil y Configuración
- [x] Crear pantalla de perfil
- [x] Implementar historial de check-ins
- [x] Crear configuración de privacidad
- [x] Implementar controles de notificaciones
- [x] Crear opción de cerrar sesión

## Fase 7: Base de Datos y Backend
- [x] Crear esquema de base de datos (usuarios, amigos, check-ins)
- [x] Implementar API tRPC para check-ins
- [ ] Implementar API tRPC para gestión de amigos
- [ ] Implementar API tRPC para obtener estado de amigos
- [ ] Configurar notificaciones push del servidor

## Fase 8: Pulido y Refinamiento
- [x] Revisar diseño visual general
- [ ] Optimizar animaciones y transiciones
- [x] Mejorar retroalimentación háptica
- [ ] Pruebas de flujos de usuario
- [ ] Optimización de rendimiento
- [ ] Pruebas en iOS y Android

## Fase 9: Características Avanzadas (Opcional)
- [ ] Historial de check-ins con estadísticas
- [ ] Recomendaciones de bares populares
- [ ] Integración con redes sociales
- [ ] Compartir ubicación con grupos específicos
- [ ] Modo "no molestar"


## Entrega de archivos
- [x] Preparar paquete fuente completo para edición en Android Studio, Android SDK o VS Code
- [x] Generar variante Android nativa si el entorno lo permite
- [x] Validar el contenido del archivo comprimido y documentar la apertura
- [x] Entregar el paquete descargable al usuario

## Nota de entrega

El proyecto usa Expo/React Native. La carpeta `android/` se generará solo para la variante Android nativa; el código fuente principal seguirá siendo compartido entre iOS y Android.



## Autenticación y Backend Real (Fase Activa)
- [ ] Revisar esquema Drizzle y tablas de base de datos en el servidor
- [ ] Implementar autenticación real de usuarios con sesión persistente
- [ ] Crear tablas de perfiles, amistades, bares y check-ins en PostgreSQL
- [ ] Implementar endpoints tRPC para check-ins en tiempo real
- [ ] Implementar gestión de solicitudes de amistad en backend
- [x] Conectar pantallas móviles de SocialSip con tRPC y TanStack Query
- [ ] Validar flujos de autenticación, errores de red y estados vacíos


## Uso real en dispositivo y Historias (Fase Activa)
- [x] Exigir inicio de sesión antes de mostrar las pestañas
- [x] Añadir pantalla de login con OAuth y estado de carga/error
- [x] Solicitar permiso de ubicación y obtener coordenadas reales
- [x] Mostrar ubicación real en mapa nativo con marcador propio
- [x] Conectar check-ins y feed con la sesión y base de datos reales
- [x] Crear tablas y APIs para historias y música
- [x] Crear pantalla de Historias de amigos y contenido público
- [x] Permitir subir foto/video con audio y elegir audiencia
- [x] Añadir controles de privacidad para ubicación e historias
- [ ] Probar el flujo completo en un dispositivo Android y otro iOS


## Arquitectura Independiente (Fuera de Manus)
- [x] Diseñar arquitectura backend y servicios externos propios
- [x] Seleccionar proveedores para autenticación, base de datos, almacenamiento y mapas
- [x] Documentar guía paso a paso de migración y configuración externa


## Migración Independiente a Supabase (Fase Activa)
- [x] Diseñar plan de migración paso a paso a Supabase y servicios propios
- [x] Solicitar al usuario la URL y la Anon Key de su proyecto Supabase mediante secretos seguros
- [x] Crear esquema SQL en Supabase para usuarios, perfiles, amistades, bares, check-ins e historias
- [x] Instalar `@supabase/supabase-js` en la aplicación móvil
- [x] Reemplazar la autenticación Manus por Supabase Auth (correo, contraseña y sesión persistente)
- [x] Reemplazar las llamadas tRPC/backend por consultas directas a Supabase
- [x] Configurar Supabase Storage para subir fotos y música de las Historias
- [x] Documentar la configuración externa y guardar checkpoint final


## Corrección de confirmación de email móvil
- [x] Añadir `socialsip://auth/callback` a las Redirect URLs permitidas en Supabase Auth
- [x] Fijar el esquema móvil estable `socialsip` en app.config.ts
- [x] Añadir `emailRedirectTo` al registro de Supabase
- [x] Crear callback `app/auth/callback.tsx` para intercambiar el código PKCE
- [ ] Regenerar el APK después del cambio de esquema
- [ ] Probar registro, correo de confirmación y retorno al APK


## Google OAuth (Supabase Auth)
- [x] Diseñar integración de Google Sign-In con Supabase Auth y deep linking `socialsip://auth/callback`
- [x] Implementar botón de Google en `app/login.tsx` usando `supabase.auth.signInWithOAuth`
- [x] Guiar al usuario paso a paso para configurar Google Cloud Console y Supabase Provider
- [ ] Validar compilación y probar inicio de sesión rápido con Google en el APK nuevo


## Corrección de autenticación en APK
- [x] Corregir `Invalid flow state` al volver de Google OAuth
- [x] Corregir el callback PKCE y la persistencia de sesión en Android
- [ ] Corregir el registro por email y los enlaces inválidos/caducados
- [ ] Configurar y documentar la opción de desactivar confirmación de email para pruebas
- [ ] Validar login Google y registro email en un APK nuevo

## Corrección solicitada: experiencia limpia y ubicación real
- [x] Eliminar nombres, bares, ubicaciones, actividades y datos ficticios de todas las pantallas; dejar estados vacíos reales para una cuenta nueva.
- [x] Mostrar el nombre elegido por el usuario y usar el correo como respaldo tras iniciar sesión.
- [x] Corregir el mapa nativo para que renderice en Android/iOS y muestre la posición real del dispositivo.
- [x] Implementar actualización de ubicación en tiempo real con permisos, manejo de errores y limpieza de suscripciones.
- [x] Revisar que check-ins, amigos e Historias consuman solo datos reales de Supabase y no mocks.
- [x] Ejecutar check, lint y pruebas; guardar checkpoint estable.

## Nuevo branding solicitado: Sky Night
- [x] Cambiar el nombre visible de la aplicación a Sky Night.
- [x] Usar “time to drink” como subtítulo visible en bienvenida, autenticación y superficies principales.
- [x] Eliminar referencias visibles restantes a SocialSip en la interfaz y documentación de uso final.
- [x] Actualizar la configuración Expo y el identificador de branding sin modificar el slug técnico ni el esquema socialsip.

## Evolución social solicitada (Fase Activa)
- [x] Añadir botón de ojo (toggle) en campos de contraseña para login y registro
- [x] Incluir mensaje claro y consciente sobre el uso de la ubicación en todo momento durante el inicio de sesión
- [x] Mover Historias desde la pestaña independiente hacia el Perfil, añadiendo foto de perfil, foto de portada y gestor de historias
- [x] Integrar un catálogo de música variada estilo Facebook en la creación de Historias
- [x] Añadir código QR personal en Amigos para escanear y conectar con otros usuarios cercanos
- [x] Ocultar la pestaña independiente de Historias y reestructurar el menú inferior
- [x] Actualizar el esquema SQL y validar compilación, linter y pruebas

## Privacidad, música y descubrimiento cercano
- [x] Mover el aviso de ubicación desde Login a una tarjeta posterior al inicio de sesión, con opción clara de aceptar o posponer.
- [x] Hacer desplazable la pantalla de Login para mostrar todos los controles en dispositivos pequeños.
- [x] No integrar Jamendo: decisión final del usuario; se mantiene la biblioteca propia de Supabase.
- [x] Mantener Historias con expiración real de 24 horas y permitir eliminación manual inmediata.
- [x] Añadir opción de Perfil público y consentimiento separado para aparecer en descubrimiento cercano.
- [x] Mostrar solo usuarios cercanos que tengan Perfil público y descubrimiento activados, sin exponer coordenadas exactas.
- [x] Implementar match/solicitud desde el descubrimiento cercano con estado real en Supabase.
- [x] Validar TypeScript, linter, pruebas y guardar checkpoint actualizado.

- [ ] Ejecutar `supabase/migrations/0004_discovery_story_privacy.sql` en el SQL Editor de Supabase.
- [x] No introducir `JAMENDO_CLIENT_ID`: decisión final del usuario.

- [x] Retirar integración de Jamendo y dejar exclusivamente la biblioteca musical propia de Supabase.

## Nuevas peticiones detalladas:
- [x] Investigar bares y lugares de bebida reales en Venezuela y permitir filtrarlos cerca de la dirección o país del usuario.
- [x] Permitir agregar un nuevo bar seleccionando directamente un punto exacto en el mapa o ingresando su dirección.
- [x] Mostrar en el mapa los check-ins activos de los amigos para saber exactamente dónde están.
- [x] Enviar notificaciones de actividad en tiempo real a la pestaña Actividad cuando los amigos realizan check-in o check-out.
- [x] Corregir el escáner QR de la cámara para que lea códigos y abra perfiles reales sin errores.
- [x] Reparar la subida de fotos de perfil y de portada guardándolas de forma segura en Supabase Storage.
- [x] Centrar y perfeccionar el diseño de los botones en la pantalla de Configuración.
- [x] Validar TypeScript, linter, pruebas y guardar checkpoint estable.

- [ ] Ejecutar `supabase/migrations/0005_venues_activity.sql` en Supabase para activar venues geolocalizados, actividad y Realtime.

## Rediseño nocturno y nuevas funciones:
- [x] Definir tokens visuales para azul marino, azul medianoche, negro azabache, plata y blanco lunar en `theme.config.js`.
- [x] Extender la base de datos con reacciones emoji en la tabla `activities`.
- [x] Rediseñar la interfaz global de Sky Night con el nuevo sistema nocturno profesional.
- [x] Añadir selector de reacciones emoji (🍺, 🔥, 🍻, 🚀, ❤️) en las notificaciones de check-in de la pestaña Actividad.
- [x] Mostrar indicadores de progreso, porcentajes y estados animados al subir fotos de perfil y portada.
- [x] Validar compilación TypeScript, linter y guardar checkpoint estable.

## Optimización de Storage multimedia:
- [x] Crear bucket `profiles` separado con políticas RLS por usuario.
- [x] Comprimir y limitar avatares, portadas e imágenes de historias antes de subirlas.
- [x] Eliminar la imagen anterior después de guardar correctamente un nuevo avatar o portada.
- [x] Limpiar archivos multimedia de historias eliminadas o expiradas mediante una cola segura.
- [x] Validar el flujo multimedia y guardar un checkpoint optimizado.

## Nuevas mejoras multimedia y mapa 3D:
- [x] Validar vídeos de historias con límite de 15 segundos y tamaño máximo antes de comprimir.
- [x] Comprimir automáticamente vídeos de historias con progreso visible.
- [x] Añadir caché persistente de Expo Image para avatares, portadas y perfiles públicos.
- [x] Crear visor inmersivo de historias con barra de progreso de 24 horas.
- [x] Ampliar el mapa y añadir perspectiva 3D con cámara inclinada.
- [x] Validar compilación, pruebas y rendimiento nativo.

## Reparación de perfil y edición de nombre:
- [x] Verificar que avatar y portada se guarden, se lean y se puedan recargar desde Storage antes de mostrar éxito.
- [x] Añadir migración para limitar el cambio de nombre a una vez cada 7 días.
- [x] Añadir lápiz y formulario de edición de nombre en Perfil.
- [x] Eliminar la etiqueta visual Sky Night VIP.
- [x] Validar permisos, errores, compilación y pruebas del perfil.

## Biografía personal:
- [x] Añadir el campo `bio` de hasta 120 caracteres en profiles.
- [x] Añadir edición inline de biografía bajo el nombre del usuario.
- [x] Mostrar la biografía en perfiles públicos.
- [x] Validar TypeScript, linter y pruebas antes de generar APK.
- [ ] Ejecutar `supabase/migrations/0010_profile_bio.sql` en Supabase antes de probar el guardado.

## Limpieza de autenticación:
- [x] Eliminar la tarjeta informativa sobre Supabase de la pantalla de inicio de sesión sin afectar los controles de acceso.

## Compilación local Android:
- [x] Aumentar el timeout del Gradle Wrapper para conexiones lentas durante la primera descarga.

## Estados avanzados:
- [x] Añadir respuestas rápidas con emojis persistentes por Estado y usuario.
- [x] Registrar vistas únicas por Estado y mostrar al autor quién lo abrió.
- [x] Añadir privacidad de Estado para todos los amigos, amigos cercanos o público.
- [x] Añadir gestión de amigos cercanos desde la pestaña Amigos.
- [x] Mantener música, audio, vídeo, expiración de 24 horas y limpieza de Storage.
- [ ] Ejecutar `supabase/migrations/0011_story_reactions_views_privacy.sql` en Supabase.
- [ ] Generar y probar el APK o compilación local con los flujos nativos.
- [ ] Intentar una compilación remota APK mediante una cuenta Expo autorizada y entregar el archivo resultante.
- [ ] Guiar la compilación local en Linux usando Node.js aislado de los conflictos de apt y validar el APK generado.
- [x] Reintentar el envío de una compilación Android remota mediante Expo y registrar su resultado.
- [x] Inventariar las funciones actuales de Sky Night y registrar las nuevas modificaciones acordadas con el usuario.

## Evolución a Tragos Sociales
- [x] Cambiar el nombre visible y los textos de marca de Sky Night a Tragos Sociales.
- [x] Reforzar la actualización automática de datos mediante Realtime y refresco al volver a primer plano.
- [x] Rediseñar el mapa nativo como una vista oscura de pantalla completa con cabecera y controles flotantes inspirados en la referencia aprobada.
- [x] Revisar los flujos principales para eliminar estados desactualizados y mejorar la respuesta de la interfaz.
- [x] Validar TypeScript, linter y pruebas después de las mejoras.

## Restauración solicitada
- [x] Restaurar el proyecto al checkpoint `99a365bd` por solicitud del usuario; las correcciones OAuth posteriores quedan fuera de esta versión.
- [ ] Validar y generar una APK basada en la versión restaurada, si se solicita.

## Corrección Expo Go y notificaciones
- [x] Evitar inicializar APIs de notificaciones push remotas cuando la app corre dentro de Expo Go en Android.
- [x] Mantener la inicialización de notificaciones para development builds y APK nativa.
- [x] Validar que el arranque y la pantalla de autenticación no se bloqueen por `expo-notifications`.

## Alcance confirmado por el usuario
- [x] Preservar todas las funciones de notificaciones push en APK y development build: permisos, token, recepción, interacción y navegación.
- [x] Evitar únicamente el error de compatibilidad de Expo Go, sin eliminar la integración ni degradar la experiencia nativa.
- [x] Comprobar que el resto de funciones siga disponible después de la corrección.

## Paquete completo para laptop
- [x] Auditar la configuración actual y documentar las funciones incluidas en esta actualización.
- [x] Generar un ZIP completo sin `node_modules`, cachés ni archivos temporales pesados.
- [x] Verificar el contenido del ZIP y entregar instrucciones de compilación EAS desde Linux.

## Bloqueo de entorno Node en laptop
- [ ] Documentar la corrección del conflicto `PREFIX=/usr` con NVM.
- [ ] Verificar que Node 20, Corepack, pnpm 9.12.0 y npx queden disponibles en una sesión limpia.
- [ ] Confirmar el comando de EAS desde `/root/TragosSociales-EAS`.

## Resolución de dependencias EAS
- [ ] Instalar dependencias en la carpeta principal del proyecto si faltan.
- [ ] Hacer que la copia EAS resuelva `expo-router` sin incluir `node_modules` en la carga.
- [ ] Verificar `expo config` y dejar el comando EAS reproducible.

## Optimización de carga EAS
- [ ] Medir las carpetas y archivos grandes del proyecto principal.
- [ ] Confirmar que `.easignore` excluya solo dependencias, cachés y artefactos generados.
- [ ] Preparar una carga EAS reproducible de pocos megabytes sin eliminar funciones.

## Copia EAS ligera solicitada
- [x] Crear una copia limpia de compilación con código, assets, configuración y migraciones completas.
- [x] Excluir dependencias locales, repositorio Git, cachés y artefactos generados.
- [x] Verificar que la copia pueda resolver Expo y subir una carga pequeña a EAS.

## Compresión EAS prolongada
- [x] Preparar una copia estática con `app.json` para evitar resolución dinámica durante la carga.
- [x] Mantener todos los módulos y archivos funcionales mientras se excluyen dependencias instaladas.
- [x] Verificar el tamaño y la integridad antes de reintentar la única build.

## Corrección del origen EAS
- [x] Evitar crear o usar una copia EAS si el origen no contiene `package.json` y `android/`.
- [x] Impedir que el procedimiento continúe desde `/root` después de un error del script.
- [x] Generar un contexto Android válido y aislado para EAS.

## Aislamiento contra ENOSPC externo
- [x] Evitar que EAS inspeccione `/root/.local` o cualquier ruta fuera del proyecto.
- [x] Crear la copia de compilación dentro de un directorio aislado y sin symlinks externos.
- [x] Verificar que el tarball local contenga únicamente archivos del proyecto antes de la build.

## Procedimiento de terminal seguro
- [x] Sustituir el bloque con `set -e` por comandos independientes que no cierren la terminal.
- [x] Mostrar la ruta actual y validar cada paso antes de iniciar EAS.
- [x] Evitar iniciar una build si la copia EAS no existe o no contiene Android.

## Corrección definitiva del script EAS
- [x] Reemplazar el cálculo ambiguo del origen por una ruta explícita del proyecto.
- [x] Hacer que el script valide el origen antes de borrar o crear la salida.
- [x] Verificar que la copia se cree correctamente con `package.json`, `android/` y sin `node_modules`.

- [ ] Guiar la compilación de un APK independiente desde la laptop mediante un paquete EAS limpio.
- [ ] Verificar el paquete de compilación sin `node_modules`, cachés ni archivos temporales pesados.
- [ ] Ejecutar el proceso EAS desde la copia aislada y documentar la solución de errores comunes.

- [ ] Preparar la copia independiente para publicación desde la interfaz de gestión y generación del APK.

- [x] Corregir crash Android: `UnreadBadge` agrega el filtro `postgres_changes` después de llamar a `subscribe()` en un canal Realtime de Supabase.
- [x] Validar TypeScript, pruebas y arranque después de corregir la suscripción Realtime.

- [x] Investigar por qué el APK probado todavía presenta el crash de Realtime después de la corrección inicial.
- [x] Auditar y endurecer todas las suscripciones Realtime para evitar canales reutilizados o listeners registrados después de `subscribe()`.
- [x] Confirmar que la siguiente publicación incluya el código corregido y una identificación de build nueva.

- [x] Configurar la API Key nativa de Google Maps para Android y eliminar el crash `API key not found`.
- [x] Reparar la selección, subida y persistencia de la foto de perfil y portada.
- [x] Reparar la creación, subida, lectura y visualización de Historias multimedia.
- [ ] Validar los tres flujos en la build Android antes de publicar otro APK.

## Solicitud actual: limpieza social, presencia y notificaciones

- [x] Ocultar el mensaje de disponibilidad del próximo cambio de nombre y mostrarlo solo al intentar cambiarlo durante el bloqueo de 7 días.
- [x] Implementar notificaciones push remotas cuando un amigo haga check-in o check-out mientras la app está cerrada o en segundo plano.
- [x] Permitir reaccionar a la notificación con respuestas predeterminadas y emojis desde la experiencia compatible del dispositivo.
- [x] Rediseñar Actividad: quitar el botón permanente de marcar como visto, marcar al tocar, usar estado rojo/no leído y verde/leído, y borrar al deslizar a la derecha.
- [x] Añadir botón estilizado para limpiar toda la bandeja de Actividad.
- [x] Mostrar indicador minimalista verde para amigos activos.
- [x] Simplificar Check-in para usar la ubicación actual automáticamente sin selector obligatorio.
- [x] Mostrar una silueta de cerveza como marcador propio cuando el usuario esté activo en el mapa.
- [x] Reparar y verificar la visibilidad real de fotos de perfil, portadas y estados después de subirlas.

- [x] Preparar un bloque SQL consolidado y repetible para activar Storage, permisos de Actividad y tokens push en Supabase.
- [x] El usuario ejecutó el bloque SQL en el SQL Editor de Supabase correctamente.

## Correcciones solicitadas por prueba real en APK

- [x] Corregir `Network request failed` al actualizar foto de perfil y portada, verificando almacenamiento y actualización de `profiles`.
- [x] Eliminar cualquier fallback de usuario o lugar predeterminado y usar siempre la ubicación GPS real del dispositivo en Check-in.
- [x] Cambiar la notificación para mostrar el nombre del usuario y “está tomando algo”, sin mostrar el nombre del lugar.
- [x] Permitir buscar usuarios públicos por nombre de usuario o correo.
- [x] Abrir el perfil público del amigo al tocarlo, mostrando avatar, portada y biografía.
- [x] Mostrar exclusivamente un icono pequeño y elegante de cerveza para el usuario activo en el mapa.
- [x] Quitar los controles superiores innecesarios del mapa.
- [x] Garantizar notificaciones push fuera de la app con reacciones rápidas desde la notificación emergente.
- [ ] Probar los cambios en un APK físico con dos cuentas y datos reales de Supabase.

- [x] Entregar las migraciones 0015 y 0016 consolidadas para pegar en el SQL Editor de Supabase.

## Prioridades confirmadas por nueva prueba del APK

- [x] Eliminar completamente el lugar predeterminado o heredado “Rodrigo” y exigir ubicación GPS real antes de crear el check-in.
- [x] Mostrar siempre el marcador propio activo como una cerveza blanca pequeña, sin punto azul o verde nativo.
- [x] Corregir de extremo a extremo la subida y visualización de avatar, portada e Historias; no confirmar éxito hasta verificar la URL y la imagen renderizada.
- [x] Quitar el texto de autenticación gestionada por Supabase de la pantalla de inicio.
- [ ] Centrar y mejorar la sección de amigos visible dentro del perfil.
- [x] Quitar el indicador rojo de Actividad al limpiar toda la bandeja.
- [x] Entregar notificaciones push emergentes para check-in de amigos con formato tipo mensajería.
- [x] Entregar notificaciones push para solicitudes de amistad con acciones de aceptar o rechazar.
- [ ] Validar todo en un APK nuevo con dos cuentas y registros reales.

- [x] Eliminar por completo la reutilización o presentación de cualquier lugar predeterminado, especialmente “Rodrigo”, en Check-in y Actividad.
- [x] Bloquear el check-in cuando no exista una coordenada GPS válida y real del dispositivo.

## Nueva prueba Android: Blob, marcador y push externo

- [x] Eliminar la construcción de Blob desde ArrayBuffer/ArrayBufferView y permitir subida de imágenes desde galería o cámara en perfil, portada e Historias.
- [x] Usar una botella de cerveza blanca como marcador de todos los usuarios activos, incluido el usuario actual.
- [x] Verificar que las notificaciones de actividad lleguen fuera de la app mediante Expo Push y webhook/Edge Function configurados.
- [x] Entregar migración SQL adicional si el flujo push necesita cambios de base de datos.
- [ ] Validar en APK físico con una imagen real y dos cuentas.

## Despliegue push en Supabase

- [x] Entregar SQL consolidado de las migraciones pendientes 0013–0017 para pegar en Supabase.
- [x] Entregar comandos listos para desplegar `notify-activity` y configurar su secreto de servidor.
- [x] Entregar pasos exactos para crear el Database Webhook de `activities`.
- [ ] Probar notificaciones push con dos dispositivos y la app cerrada.

- [ ] Generar el APK Android desde el botón Publish/Publicar de la interfaz.
- [ ] Instalar el APK nuevo y validar GPS, fotos, mapa y notificaciones push.

## Fallos confirmados en la prueba real del APK

- [ ] Mostrar en el mapa la ubicación real del usuario actual y la de sus amigos activos, todos con botella de cerveza blanca.
- [x] Eliminar puntos genéricos del mapa cuando representan usuarios activos.
- [x] Reparar de extremo a extremo la subida y renderización real de fotos de perfil, portadas e Historias.
- [x] Añadir refresco automático de actividad, amigos, check-ins e Historias sin cerrar y abrir la aplicación.
- [x] Diagnosticar y corregir la entrega de notificaciones push con la app cerrada.
- [ ] Validar todos los flujos en un APK Android nuevo con datos reales.

## Nueva prioridad: mapa profesional y multimedia funcional

- [x] Rediseñar la botella blanca del mapa con una silueta más estilizada y profesional.
- [x] Restaurar la opción de vista 3D del mapa sin reintroducir controles innecesarios.
- [x] Auditar buckets, políticas SQL, rutas, permisos y URLs públicas de Storage.
- [x] Hacer funcionales y verificables las imágenes de avatar, portada e Historias en todos los perfiles.
- [x] Entregar migración SQL corregida para Storage si la configuración actual está incompleta.
- [ ] Validar las imágenes en un APK físico con datos reales.

## Rehacer multimedia desde cero por fallo persistente

- [x] Auditar selección de galería, URI, MIME, tamaño y lectura real de archivos.
- [x] Reemplazar la utilidad de subida por una ruta única y compatible con Android, iOS y web.
- [x] Rehacer subida y persistencia de avatar y portada con confirmación de fila y objeto.
- [x] Rehacer publicación de Historias de imagen desde la galería con confirmación de renderizado.
- [x] Añadir estados de error reales y evitar mensajes de éxito si la imagen no se puede descargar.
- [x] Validar que las URLs guardadas sobrevivan a un refresco y a una nueva sesión.
- [ ] Probar en APK físico con una imagen real de la galería.

## Diagnóstico solicitado: fotos siguen sin aparecer

- [ ] Identificar con evidencia si falla la lectura del archivo, la subida, la persistencia de la URL o el renderizado.
- [ ] Explicar al usuario el flujo completo y la causa concreta del fallo actual.
- [ ] Confirmar si el APK instalado contiene el checkpoint multimedia más reciente.

## SQL consolidado completo solicitado

- [x] Inventariar todas las migraciones SQL del proyecto y sus dependencias.
- [x] Crear un archivo único con tablas, columnas, funciones, triggers, buckets y políticas.
- [x] Validar el orden y la idempotencia del SQL consolidado.
- [x] Entregar el archivo listo para copiar y pegar en Supabase.

## Entrega solicitada: SQL único y APK

- [x] Preparar el SQL completo como archivo único para copiar y pegar.
- [ ] Generar el APK Android desde Publish/Publicar y probarlo en un dispositivo físico.

## Verificación del APK multimedia instalado

- [ ] Confirmar que el APK instalado fue generado desde el checkpoint que contiene `expo/fetch` + `File`.
- [ ] Diferenciar un APK antiguo de un fallo real de Storage usando una prueba observable.
- [ ] Entregar al usuario el paso exacto para instalar y probar la versión correcta.

## Diagnóstico específico: renderizado de imágenes

- [x] Comparar los campos `avatar_url`, `cover_url` y `media_url` con las fuentes usadas por cada pantalla.
- [x] Revisar consultas, navegación y caché de imágenes en Perfil, perfil público e Historias.
- [x] Corregir la fuente única de URL y mostrar errores de renderizado reales.
- [ ] Validar que la foto se vea después de guardar, cambiar de pantalla y volver a abrir la app.

## Error al crear APK

- [ ] Revisar el mensaje exacto y logs del fallo de compilación Android.
- [x] Corregir configuración o dependencia que bloquee Publish/Publicar.
- [ ] Validar nuevamente el bundle Android antes de entregar otro checkpoint.

## Nuevo marcador basado en imagen de referencia

- [x] Crear un asset de botella negra con cerveza dorada, espuma blanca y burbujas, optimizado para marcador pequeño.
- [x] Usar el mismo asset para mi ubicación y para todos los amigos activos.
- [x] Validar tamaño, anclaje y legibilidad del marcador en el mapa.

## Bloqueo de compilación Gradle reportado por el usuario

- [ ] Obtener las líneas posteriores a `Daemon will be stopped` para identificar la causa exacta.
- [x] Revisar plugins, dependencias y configuración nativa que afectan `assembleRelease`.
- [ ] Aplicar la corrección y guardar un checkpoint listo para volver a publicar.

## Revisión preventiva solicitada del APK

- [ ] Auditar configuración de Expo/EAS, plugins nativos, recursos e identificador Android.
- [ ] Validar dependencias compatibles con Expo SDK 54 y configuración generada.
- [ ] Corregir bloqueos seguros de `assembleRelease` sin alterar funcionalidades sociales.
- [x] Validar configuración, TypeScript y pruebas antes del nuevo checkpoint.

## Nueva identidad visual con lata BEBE CONMIGO

- [x] Preparar la lata de referencia como asset optimizado con transparencia real.
- [x] Usar la misma lata para todos los activos del mapa con tamaño legible.
- [x] Añadir botón superior para alternar mapa estilizado y mapa realista.
- [x] Mostrar la lata dentro de un círculo de check-in ampliado.
- [x] Quitar el círculo superior del inicio de sesión.

## Ajustes visuales y fotos negras solicitados

- [x] Centrar vertical y horizontalmente el contenido de inicio de sesión.
- [x] Convertir la lata del mapa en un marcador vectorial nítido y escalable.
- [x] Reemplazar el texto Real/Mapa por un icono intuitivo.
- [x] Aumentar el botón circular y renombrar Check-in como Brindar.
- [x] Analizar el video y corregir el renderizado negro de las fotos.

## Cambios sobre f7ec7a7c

- [x] Integrar exclusivamente la lata BEBE CONMIGO en el botón de Brindar.
- [x] Usar exclusivamente la misma lata para todos los activos del mapa.
- [x] Mantener datos e imágenes visibles mientras la sincronización ocurre en segundo plano.
- [x] Añadir conexión Realtime persistente sin spinners ni saltos visuales.

## Imagen original obligatoria y flujos sociales

- [x] Copiar la imagen original adjunta sin editarla ni vectorizarla.
- [x] Usar ese archivo original en el botón de Brindar y en todos los marcadores del mapa.
- [x] Mantener sincronización persistente silenciosa sin spinners ni saltos visibles.
- [x] Bloquear reacciones propias y notificar reacciones de otras personas.
- [x] Mostrar avatar y aro de estado en Amigos con acceso directo al estado.
- [x] Mantener Chat y respuestas de estados accesibles desde el perfil del amigo.


## Correcciones de avatares, badge y visor de Estados

- [x] Encajar avatares de Amigos perfectamente en círculos sin desbordamiento ni deformación.
- [x] Mostrar anillo verde para Estados activos no vistos y gris/neutro para vistos.
- [x] Abrir el Estado tocando directamente la foto o el anillo.
- [x] Añadir badge verde con total de mensajes no leídos sobre el botón de Chat.
- [x] Ocultar el badge al abrir y leer la conversación.
- [x] Corregir imágenes PNG negras en el visor con carga y `contain`.
- [x] Ocultar respuestas y emojis en Estados propios y mostrar “Visto por X personas”.
- [x] Enviar las reacciones de Estados de terceros directamente al Chat privado.
- [x] Rediseñar el visor con progreso segmentado y barra de texto redondeada estilo WhatsApp.


## Corrección SQL read_at

- [x] Reordenar la migración para crear `read_at` antes del índice de mensajes no leídos.
- [x] Validar el SQL corregido y entregar un archivo listo para Supabase.


## Estados, notificaciones y sincronización avanzada

- [x] Corregir fuente y renderizado de PNG en el visor con `contain`, centrado y spinner.
- [x] Recortar miniaturas de Estados en círculos perfectos con `overflow: hidden` y `cover`.
- [x] Separar el toque del anillo verde para abrir Estado del toque del avatar para abrir perfil.
- [x] Mostrar información básica y Chat en perfiles restringidos.
- [x] Mantener controles de respuesta ocultos en Estados propios y mostrar “Visto por X personas”.
- [x] Enviar reacciones y respuestas de terceros al Chat privado.
- [x] Configurar notificaciones Heads-Up cerradas con respuesta de Chat, solicitudes y acciones de Brindar.
- [x] Reforzar sincronización Realtime de mensajes, Estados, notificaciones, solicitudes y perfiles sin cargas visibles.


## Validación externa pendiente

- [ ] Desplegar la función `notify-activity` actualizada en Supabase.
- [ ] Configurar webhooks de `activities` y `direct_messages` hacia la función.
- [ ] Probar Heads-Up, respuesta en línea y acciones de Brindar en un APK Android físico.
- [ ] Confirmar permisos de notificaciones y token Expo en dos dispositivos.


## Migración a otra cuenta Expo

- [x] Desvincular la aplicación del proyecto Expo anterior `rudeosgreyrad416`.
- [x] Crear o vincular un proyecto Expo nuevo bajo la cuenta nueva.
- [x] Actualizar el `projectId` y propietario Expo sin alterar el slug de la aplicación.
- [x] Regenerar o registrar credenciales de notificaciones push para el proyecto nuevo.
- [ ] Compilar y probar un APK nuevo bajo la cuenta nueva.


## Maquetación exacta de Estados, Amigos y Chat

- [x] Construir overlay absoluto del visor con cabecera dinámica, avatar, nombre, tiempo y menú solo para propietario.
- [x] Mostrar en Estados propios únicamente píldora de vistas/reacciones y ocultar respuesta/emojis.
- [x] Mostrar en Estados ajenos píldora de respuesta con TextInput, emojis y corazón independiente.
- [x] Ajustar el bloque inferior con `useSafeAreaInsets` y `paddingBottom` seguro.
- [x] Aumentar avatar de Amigos a 60–70 px con recorte circular perfecto.
- [x] Hacer independiente el toque del avatar/anillo y de la tarjeta completa.
- [x] Ocultar inmediatamente el anillo verde al registrar el Estado como visto.
- [x] Conectar badge Chat a `unreadCount`, `markAsRead(friendId)` y `useFocusEffect`.


## Compilación APK solicitada

- [x] Enviar la versión más reciente a compilación Android APK.
- [x] Confirmar el estado y entregar el enlace del build.


## Retoques adicionales del visor y Amigos

- [x] Mantener navegación al Estado solo al tocar el avatar/anillo y perfil al tocar el resto de la tarjeta.
- [x] Mantener anillo gris después de visto y permitir reabrir el Estado.
- [x] Mover la leyenda por encima de la barra de respuesta.
- [x] Convertir el botón inferior en corazón con toggle azul persistente.
- [x] Quitar la X del visor y conservar salida mediante Atrás nativo.
- [x] Simplificar Mi Estado con leyenda sobre el botón de vistas.
- [x] Enviar emojis rápidos al Chat inmediatamente sin estado seleccionado.
- [x] Pausar y reanudar Estado y progreso con pulsación sostenida.


## Nuevo build APK inmediato

- [x] Enviar a compilación Android la versión `f3b53de6`.
- [x] Confirmar el identificador y estado del build enviado.


## Fluidez Realtime del visor y Chat

- [x] Pausar el progreso inmediatamente al mantener presionado y reanudar sin saltos al soltar.
- [x] Limitar cambios de Estado a gestos horizontales deliberados hacia derecha o izquierda.
- [x] Animar los emojis de reacción volando hacia arriba sin dejar selección persistente.
- [x] Usar corazón azul en la barra inferior y contador reducido a ojo más espectadores.
- [x] Actualizar vistas al instante por Realtime y abrir la lista de perfiles al tocar el contador.
- [x] Incrementar el badge de Chat en tiempo real y ocultarlo al abrir y leer la conversación.


## Build APK del checkpoint 98262350

- [x] Enviar el checkpoint `98262350` a compilación Android APK.
- [x] Confirmar el identificador y estado remoto del build.


## Navegación por tap y pausa limpia del visor

- [x] Eliminar la dependencia de swipe para cambiar de Estado.
- [x] Avanzar o retroceder mediante tap en los márgenes laterales.
- [x] Pasar automáticamente al siguiente perfil al terminar las publicaciones del actual.
- [x] Aplicar transición visual tipo cubo 3D entre perfiles.
- [x] Añadir corazón flotante de Me gusta en la barra inferior.
- [x] Ocultar cabecera y barra inferior durante long press, manteniendo pausa y progreso detenidos.


## Build APK del checkpoint 52d0a8e7

- [x] Enviar el checkpoint `52d0a8e7` a compilación Android APK.
- [x] Confirmar el identificador y estado remoto del build.


## Precarga y panel de vistas del visor

- [x] Precargar historias desde la pantalla principal con `Image.prefetch()`.
- [x] Mostrar skeleton loader mientras se resuelve la imagen del visor.
- [x] Mantener transición tipo cubo 3D entre perfiles.
- [x] Congelar el temporizador mientras el panel de vistas esté abierto.
- [x] Mostrar avatares circulares en la lista de espectadores.
- [x] Abrir y cerrar el panel mediante ojo y swipe vertical.
- [x] Aislar eventos de ojo, corazón y panel con propagación controlada.


## Build APK del checkpoint e067b55b

- [x] Enviar el checkpoint `e067b55b` a compilación Android APK.
- [x] Confirmar el identificador y estado remoto del build.


## Eventos, Top 5 y feed oficial

- [ ] Añadir botón EVENTOS en Home encima de “Ver amigos en el mapa”.
- [ ] Crear pantalla Eventos con carrusel horizontal del Top 5.
- [ ] Mostrar foto, nombre, dirección y botón Ir para cada local.
- [ ] Navegar desde Ir al mapa centrado en el local con estrella por ranking.
- [ ] Crear feed oficial de fotos y videos con sello Tragos Sociales, Oficial.
- [ ] Añadir descripción, fecha de publicación, Me gusta, comentarios y compartir.
- [ ] Restringir la creación y borrado de publicaciones al administrador.
- [ ] Crear panel administrador para foto, dirección y orden del Top 5.
- [ ] Proteger roles, tablas, Storage y operaciones administrativas en Supabase.

## Eventos, Top 5 y Feed Oficial
- [x] Añadir botón EVENTOS en Home encima de Ver amigos en el mapa
- [x] Crear pantalla Eventos con carrusel horizontal del Top 5
- [x] Centrar el mapa en el local elegido y mostrar su ranking por color
- [x] Crear feed oficial con fotos/videos, fecha, Me gusta, comentarios y compartir
- [x] Crear panel administrador para editar nombre, dirección y orden del Top 5
- [x] Crear publicación y eliminación de contenido oficial solo para administradores
- [x] Añadir sincronización Realtime para locales, publicaciones, likes y comentarios
- [ ] Ejecutar `supabase/migrations/0021_events_official_feed.sql` en el SQL Editor de Supabase
- [ ] Crear/verificar buckets `venue-assets` y `official-feed` y sus políticas Storage en Supabase
- [ ] Validar permisos admin, subida multimedia y centrado del mapa en APK físico

## Compilación APK de Eventos
- [ ] Enviar la versión actual con Eventos y migración 0021 a una build APK de Expo
- [ ] Verificar el resultado de la build y entregar el identificador/enlace de compilación

## Mejoras solicitadas desde video adjunto
- [x] Analizar visual y auditivamente el video completo
- [x] Registrar cada ajuste solicitado y asociarlo a su pantalla correspondiente
- [x] Implementar las mejoras confirmadas tras el análisis
- [ ] Validar la aplicación y preparar checkpoint actualizado

## Build de correcciones del video y Migración 0021 actualizada
- [x] Validar la versión corregida y la Migración 0021 sincronizada
- [x] Enviar la versión corregida a build APK de Expo
- [x] Entregar la Migración 0021 lista para copiar y ejecutar

## Ajustes adicionales solicitados
- [x] Mantener únicamente cinco pestañas inferiores y retirar cualquier acceso de Eventos del tab bar
- [x] Usar el ícono de altavoz proporcionado en el botón Eventos con estilo coherente con la marca
- [x] Permitir imágenes completas sin recorte obligatorio y adaptar el contenedor proporcionalmente
- [x] Adaptar videos a su formato, reproducirlos con audio, permitir silencio y pantalla completa
- [x] Corregir creación y gestión completa del carrusel Top 5 desde el panel admin
- [x] Aplicar KeyboardAvoidingView en todos los formularios y superficies de texto relevantes
- [x] Validar la implementación, guardar checkpoint y preparar nueva build

## Nueva build y entrega SQL
- [ ] Validar el checkpoint y la Migración 0021 actualizada
- [ ] Enviar la versión guardada a una build APK de Expo
- [x] Entregar la Migración 0021 lista para copiar y ejecutar

## Mejoras avanzadas de Top 5 y feed oficial
- [x] Intercambiar posiciones del Top 5 sin borrar el local desplazado
- [x] Permitir recortar, girar y reemplazar fotos al crear o editar locales
- [x] Abrir la foto de cada local Top 5 en pantalla completa
- [x] Usar la dirección del local para ubicarlo en el mapa con su estrella de ranking
- [x] Mostrar junto a Tragos Sociales el avatar real del administrador que publicó
- [x] Bloquear pausa y avance de video fuera de pantalla completa, manteniendo solo silencio
- [x] Ajustar todos los videos a su proporción original sin deformarlos
- [x] Permitir respuestas y reacciones de corazón en comentarios
- [x] Actualizar la migración SQL y validar una nueva versión

## Nueva build avanzada y migración
- [x] Validar la versión avanzada y la Migración 0021 actualizada
- [x] Enviar la versión avanzada a una build APK de Expo
- [x] Entregar la Migración 0021 lista para copiar y ejecutar

## Correcciones reportadas después de la última build
- [x] Verificar la columna `parent_comment_id` y recarga de caché de esquema de Supabase
- [x] Hacer opcional la geocodificación al guardar locales Top 5
- [x] Estabilizar adelanto y retroceso de videos al soltar el control
- [x] Mostrar nombre y avatar reales del administrador creador de cada publicación
- [x] Ajustar videos verticales y horizontales usando dimensiones originales y `contain`
- [x] Validar, guardar checkpoint y entregar SQL/indicaciones actualizadas
