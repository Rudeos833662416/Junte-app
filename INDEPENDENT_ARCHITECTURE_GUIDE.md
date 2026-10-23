# Guía de arquitectura independiente para SocialSip

## Introducción

Para operar **SocialSip** de forma completamente autónoma fuera de la infraestructura de Manus, es necesario migrar los servicios de autenticación, base de datos, almacenamiento de archivos multimedia, mapas y notificaciones push a proveedores externos bajo tu propio control y cuentas personales o corporativas. A continuación se detalla la arquitectura recomendada, la comparación de plataformas y los pasos necesarios para realizar la migración.

---

## 1. Comparativa de plataformas Backend-as-a-Service (BaaS)

Para cubrir las necesidades de autenticación, base de datos relacional y almacenamiento de fotos, vídeos y música, existen tres alternativas principales en el mercado:

| Proveedor | Autenticación | Base de datos | Almacenamiento | Ventajas principales |
| :--- | :--- | :--- | :--- | :--- |
| **Supabase** | Email, OAuth social, Magic Link, JWT [1] | PostgreSQL nativo [3] | Supabase Storage (S3 compatible) [3] | PostgreSQL completo, políticas RLS, excelente integración con React Native y SQL nativo. |
| **Firebase** | Email, teléfono, Google, Apple, Twitter [2] | Cloud Firestore / Realtime DB | Cloud Storage for Firebase [2] | Ecosistema Google robusto, SDKs maduros y notificaciones push directas con FCM. |
| **Appwrite** | Email, OAuth2, teléfono, anónimo [4] | Base de datos interna de Appwrite | Appwrite Storage [4] | Opción open-source autohospedable, SDKs flexibles y control total de los servidores. |

> **Recomendación arquitectónica**: Se recomienda **Supabase** como la opción más natural para SocialSip, ya que utiliza **PostgreSQL** de forma nativa [3], lo que permite conservar el diseño relacional de usuarios, amistades, bares, check-ins e historias desarrollado en Drizzle ORM, facilitando enormemente la migración del esquema de base de datos.

---

## 2. Arquitectura de servicios recomendada

Para que SocialSip funcione de manera independiente, cada capa de la aplicación se conectará a un servicio externo específico:

```
┌────────────────────────────────────────────────────────┐
│               SocialSip Mobile App                     │
│         (React Native / Expo SDK 54)                   │
└────┬──────────────┬──────────────┬──────────────┬──────┘
     │              │              │              │
     ▼              ▼              ▼              ▼
┌─────────┐    ┌──────────┐   ┌──────────┐   ┌───────────┐
│Supabase │    │Supabase  │   │Supabase  │   │ Expo Push │
│ Auth    │    │ Postgres │   │ Storage  │   │ / FCM     │
└─────────┘    └──────────┘   └──────────┘   └───────────┘
```

1. **Autenticación**: Supabase Auth gestionará el registro, inicio de sesión por correo, contraseñas o proveedores sociales (Google y Apple), emitiendo tokens JWT seguros para cada sesión de usuario.
2. **Base de datos**: PostgreSQL en Supabase almacenará las tablas `users`, `venues`, `checkins`, `friendships` y `stories`. Las consultas se realizarán mediante el cliente oficial `@supabase/supabase-js` o vistas directas.
3. **Almacenamiento multimedia**: Supabase Storage se encargará de guardar las imágenes, vídeos y archivos de audio de las historias en buckets públicos o privados con políticas de seguridad estrictas.
4. **Mapas y geolocalización**: Se utilizará **Expo Location** para la obtención de coordenadas del dispositivo y **react-native-maps** configurado con una clave propia de Google Maps Platform (Android/iOS) o Mapbox.
5. **Notificaciones Push**: **Expo Notifications** combinada con **Firebase Cloud Messaging (FCM)** para Android y **Apple Push Notification service (APNs)** para iOS, gestionando el envío de alertas cuando un amigo hace check-in.

---

## 3. Plan de migración paso a paso

### Paso 1: Crear tu propio proyecto en Supabase
1. Accede a [Supabase](https://supabase.com/) y crea una cuenta gratuita o de pago.
2. Crea un nuevo proyecto y anota la `SUPABASE_URL` y la `SUPABASE_ANON_KEY` desde la sección de configuración de API.
3. En el editor SQL de Supabase, ejecuta las sentencias DDL para recrear las tablas de SocialSip (`users`, `venues`, `checkins`, `friendships`, `stories`) con sus correspondientes claves foráneas e índices.

### Paso 2: Configurar la autenticación
1. En el panel de Supabase, habilita los proveedores de autenticación deseados (Correo/Contraseña, Google, Apple).
2. Configura las URLs de redirección para que coincidan con el esquema de deep linking de tu app Expo (por ejemplo, `tuscheme://auth/callback`).
3. Sustituye el hook de autenticación en la app móvil por `@supabase/supabase-js` para manejar `signInWithPassword`, `signUp` y `signOut`.

### Paso 3: Adaptar las consultas y mutaciones en la app
1. Instala el cliente de Supabase en el proyecto: `npx expo install @supabase/supabase-js @react-native-async-storage/async-storage`.
2. Reemplaza los endpoints tRPC y el backend Express local por llamadas directas al cliente de Supabase (`supabase.from('checkins').insert(...)`, `supabase.from('stories').select(...)`).
3. Para la subida de historias con fotos y música, utiliza `supabase.storage.from('stories').upload(path, fileBuffer)`.

### Paso 4: Configurar los mapas con claves propias
1. Obtén una clave de API de **Google Maps Platform** con habilitación para Maps SDK for Android y Maps SDK for iOS.
2. Añade las claves en `app.config.ts` dentro de la configuración nativa de Android e iOS para que `react-native-maps` renderice los mapas correctamente en las builds de producción.

### Paso 5: Desplegar y compilar la aplicación
1. Genera las credenciales de distribución con EAS (Expo Application Services) ejecutando `eas build --platform all`.
2. Instala la app en dispositivos reales para verificar que el inicio de sesión contra tu Supabase personal, la geolocalización y la subida de historias operan de forma autónoma.

---

## 4. Referencias

[1] Supabase Team. *Supabase Auth Documentation*. https://supabase.com/docs/guides/auth [2] Google. *Firebase Authentication Overview*. https://firebase.google.com/docs/auth [3] Supabase Team. *PostgreSQL Database and Storage*. https://supabase.com/docs [4] Appwrite Team. *Appwrite Authentication Products*. https://appwrite.io/docs/products/auth
