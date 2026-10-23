# Tragos Sociales — Funciones actuales

## Propósito de la aplicación

Tragos Sociales es una red social para salir a tomar algo con amigos. Permite hacer **check-in en bares y locales reales**, conocer la actividad de amistades, compartir Estados temporales y decidir qué información se hace visible mediante controles de privacidad.

## Acceso y cuenta

| Función | Comportamiento actual |
|---|---|
| Registro | Crea una cuenta con correo electrónico, contraseña y nombre elegido. |
| Inicio de sesión | Permite entrar por correo y contraseña. |
| Inicio rápido con Google | Usa Google a través de Supabase Auth. |
| Contraseña visible | Incluye el icono de ojo para mostrar u ocultar la contraseña. |
| Sesión persistente | La sesión queda guardada en el dispositivo hasta que el usuario cierra sesión. |
| Cierre de sesión | Disponible desde Perfil. |
| Mensaje de ubicación | Después de acceder aparece una explicación sobre la ubicación y una opción de permitirla o posponerla. |

## Navegación principal

La barra inferior muestra cinco secciones: **Check-in**, **Amigos**, **Mapa**, **Actividad** y **Perfil**. La pantalla de Estados no aparece como pestaña independiente: se abre desde el Perfil para mantener el menú limpio.

| Sección | Qué permite hacer |
|---|---|
| Check-in | Elegir un sitio, marcar llegada y finalizar la visita. |
| Amigos | Consultar amistades, solicitudes, QR, personas cercanas y amigos cercanos. |
| Mapa | Ver ubicación propia y los check-ins activos de amigos. |
| Actividad | Consultar novedades y reacciones recibidas. |
| Perfil | Editar identidad, fotos, privacidad, estadísticas e Historias. |

## Check-in y lugares

La pantalla principal parte sin datos falsos. Una cuenta nueva verá un estado vacío hasta elegir un sitio real.

| Función | Comportamiento actual |
|---|---|
| Búsqueda de locales cercanos | Usa la ubicación con permiso del usuario para consultar bares, pubs, discotecas y lugares de bebida cercanos. |
| Búsqueda por texto | Busca por dirección, ciudad o nombre de local en Venezuela. |
| Selección sobre mapa | Permite tocar un punto exacto en el mapa para crear un lugar. |
| Alta de local | Guarda nombre, dirección, ciudad, país y coordenadas en Supabase. |
| Check-in | Cierra cualquier visita activa anterior y crea un check-in activo en el local elegido. |
| Check-out | Finaliza la visita activa y deja de mostrarla como activa a amistades. |
| Aviso local | Muestra una confirmación en el teléfono tras compartir el check-in. |
| Estado visual | Indica Online mientras hay un check-in activo u Offline cuando no lo hay. |

## Mapa y ubicación

| Función | Comportamiento actual |
|---|---|
| Ubicación actual | Solicita permiso de ubicación en Android/iOS y centra el mapa en la posición real del teléfono. |
| Seguimiento en primer plano | Actualiza la posición mientras la pantalla de mapa está abierta. |
| Mapa 3D | Incluye edificios, inclinación y control para activar o desactivar la vista 3D. |
| Amigos en mapa | Muestra marcadores de amistades con check-in activo en locales que tienen coordenadas. |
| Privacidad | El aviso del mapa aclara que el marcador muestra el local del check-in, no la dirección personal exacta. |
| Ajustes del dispositivo | Si se deniega ubicación, ofrece abrir Ajustes del teléfono. |

## Amigos y descubrimiento

| Función | Comportamiento actual |
|---|---|
| Lista de amigos | Muestra amistades aceptadas y si tienen un check-in activo. |
| Estado de amigos | Presenta el bar y la hora de check-in cuando corresponda. |
| Búsqueda | Filtra amigos por nombre. |
| Solicitudes | Muestra solicitudes entrantes y permite aceptarlas o bloquearlas. |
| Amigos cercanos | Permite marcar o quitar una amistad como cercana. |
| Descubrir cerca | Busca perfiles públicos que hayan decidido aparecer cerca; solo muestra distancia aproximada. |
| Perfil público | Al tocar una persona cercana se abre su perfil para enviar una solicitud con mensaje opcional. |
| Código QR personal | Genera un código QR que identifica el perfil de cada usuario. |
| Escáner QR | Abre la cámara, valida el QR y lleva al perfil de la persona escaneada. |

## Estados e Historias

La experiencia se inspira visualmente en los Estados de WhatsApp, con actualizaciones agrupadas por persona y visor a pantalla completa.

| Función | Comportamiento actual |
|---|---|
| Publicar imagen | Permite elegir una foto, comprimirla y publicarla. |
| Publicar vídeo | Permite vídeo de hasta 15 segundos; valida tamaño, comprime y rechaza contenido demasiado pesado. |
| Duración | Cada Estado expira automáticamente tras 24 horas. |
| Texto | Permite una leyenda opcional. |
| Audiencia | Puede elegirse entre todos los amigos, amigos cercanos o público. |
| Agrupación | Reúne todos los Estados de una persona en un mismo anillo/lista. |
| Visor inmersivo | Incluye barras segmentadas de progreso, avance o retroceso por toque y pausa al mantener pulsado. |
| Reacciones rápidas | Permite enviar o retirar reacciones como fuego, corazón, aplausos, risa, sorpresa y brindis. |
| Vistas | El autor de un Estado puede abrir la lista de personas que lo vieron. |
| Eliminar propio | El autor puede borrar su Estado antes de que expire. |
| Gestión | Se accede desde el botón **Gestionar Historias y Música** del Perfil. |

## Actividad y notificaciones dentro de la aplicación

| Función | Comportamiento actual |
|---|---|
| Feed de actividad | Muestra check-ins, check-outs, solicitudes y reacciones dirigidas al usuario. |
| Actualización en tiempo real | Escucha cambios de Supabase Realtime para refrescar la actividad. |
| Reacciones a check-ins | Permite reaccionar con 🍺, 🔥, 🍻, 🚀 o ❤️ desde la actividad. |
| Reacciones a Estados | Cuando se configura la migración correspondiente, genera actividad persistente para el autor. |
| Indicador rojo | La pestaña Actividad muestra un punto rojo si existen novedades sin leer. |
| Lectura | Al entrar en Actividad, las novedades se marcan como vistas. |
| Marcar como visto | Incluye un botón para marcar la actividad visible como leída. |

## Perfil, multimedia y privacidad

| Función | Comportamiento actual |
|---|---|
| Foto de perfil | Se selecciona desde la galería, se recorta, comprime y sube a Supabase Storage. |
| Foto de portada | Sigue el mismo flujo, con formato panorámico. |
| Progreso de carga | Muestra porcentajes y mensajes durante preparación, compresión, subida y guardado. |
| Caché de imágenes | Usa caché persistente en disco para avatar y portada. |
| Limpieza | Borra la imagen anterior después de guardar correctamente la nueva versión. |
| Nombre | Puede editarse con límite de 2 a 20 caracteres y un intervalo de 7 días. |
| Biografía | Puede editarse debajo del nombre y tiene límite de 120 caracteres en la versión actual. |
| Estadísticas | Muestra número de check-ins y cantidad de bares visitados. |
| Historial | Muestra los tres check-ins más recientes. |
| Perfil público | Hace al usuario visible para otras personas según las políticas de Supabase. |
| Aparecer cerca | Control separado para el descubrimiento cercano. Requiere perfil público. |
| Compartir ubicación | Control para permitir sincronizar ubicación cuando se usa el mapa. Al apagarlo, se elimina la ubicación compartida. |
| Notificaciones | Interruptor visual para alertas y actividad. |

## Datos, rendimiento y arquitectura

| Área | Implementación actual |
|---|---|
| Usuarios y sesión | Supabase Auth. |
| Base de datos | Supabase PostgreSQL con tablas de perfiles, amistades, venues, check-ins, Estados, vistas, reacciones y actividad. |
| Archivos | Supabase Storage separa imágenes de perfil y contenido de Estados. |
| Tiempo real | Supabase Realtime actualiza amigos, check-ins, actividad e indicador de no leídas. |
| Imágenes | Fotos de perfil, portadas e imágenes de Estado se comprimen antes de subirlas. |
| Vídeos | Se validan y comprimen para conservar un tamaño razonable. |
| Mapas | React Native Maps y Google Maps en la aplicación nativa; consultas de lugares con OpenStreetMap. |
| Diseño | Estética premium de azul marino, azul medianoche, negro azabache, plata y blanco lunar. |
| Plataformas | Código compartido con Expo/React Native para Android e iOS. |

## Dependencias externas que deben permanecer configuradas

La aplicación depende de un proyecto Supabase propio para autenticación, base de datos, Storage y Realtime. Para que todas las funciones avanzadas estén disponibles, las migraciones SQL del proyecto deben estar aplicadas. Las funciones de visualización de vistas/reacciones de Estados requieren la migración `0011_story_reactions_views_privacy.sql`; las notificaciones de actividad en tiempo real requieren la migración `0012_activity_notifications_sync.sql`.

## Próximo paso

Indica qué deseas cambiar. Puedes escribirlo con frases sencillas, por ejemplo: “quita Historias”, “haz el mapa como Instagram”, “cambia el diseño”, “añade chat” o “simplifica el perfil”. Antes de programarlo, lo convertiré en una lista clara de cambios para que confirmes que todo está correcto.
