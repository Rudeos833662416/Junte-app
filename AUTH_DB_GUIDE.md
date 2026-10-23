# Guía Paso a Paso: Autenticación Real y Base de Datos en SocialSip

## Introducción

Este documento detalla la configuración y arquitectura implementada para dotar a **SocialSip** de un sistema robusto de autenticación real mediante OAuth/sesiones seguras, persistencia relacional en **PostgreSQL** mediante Drizzle ORM [1], y endpoints **tRPC** para gestionar usuarios, amistades y check-ins en tiempo real [2].

---

## 1. Modelo de Datos Relacional

El esquema de base de datos se encuentra definido en `drizzle/schema.ts` y consta de cuatro tablas principales que aseguran la integridad referencial y el rendimiento de las consultas sociales [3]:

| Tabla | Propósito principal | Columnas clave |
|---|---|---|
| `users` | Almacena la identidad y perfil de cada usuario | `id`, `openId`, `name`, `email`, `loginMethod`, `role`, `createdAt` |
| `venues` | Registra los bares y locales disponibles para check-in | `id`, `name`, `address`, `city`, `latitude`, `longitude` |
| `checkins` | Controla los check-ins activos e históricos en locales | `id`, `userId`, `venueId`, `status` (`active`/`ended`), `note`, `createdAt` |
| `friendships` | Gestiona el grafo de amistades y solicitudes pendientes | `id`, `userId`, `friendId`, `status` (`pending`/`accepted`/`blocked`), `createdAt` |

---

## 2. Arquitectura de Autenticación y Sesión

La autenticación en SocialSip utiliza el flujo OAuth integrado en la plataforma Manus. El servidor valida las credenciales y emite una cookie de sesión cifrada (`session` o similar) gestionada por `server/_core/cookies.ts` y validada en cada llamada mediante `server/_core/trpc.ts` [4].

### Procedimientos tRPC disponibles:

- **`auth.me`**: Retorna el objeto de usuario autenticado actual o `null` si la sesión ha expirado o no ha iniciado sesión.
- **`auth.logout`**: Invalida la sesión actual limpiando la cookie y redirigiendo al estado de invitado.
- **`socialsip.venues`**: Endpoint público para listar los bares disponibles en la plataforma.
- **`socialsip.checkin`**: Endpoint protegido que finaliza cualquier check-in previo del usuario y registra uno nuevo en el bar seleccionado.
- **`socialsip.feed`**: Endpoint protegido que consolida el estado activo del usuario y el de sus amigos aceptados para mostrarlos en tiempo real.

---

## 3. Pasos para Activar y Gestionar la Base de Datos

Para desplegar y conectar la base de datos en tu entorno de producción o desarrollo local, sigue estos pasos:

1. **Configurar la variable de entorno `DATABASE_URL`**: Asegúrate de que tu instancia de PostgreSQL esté activa y que la URL de conexión tenga el formato estándar `mysql://user:password@host:port/database` o `postgresql://...` según el driver configurado en Drizzle.
2. **Generar y aplicar migraciones**:
   ```bash
   pnpm drizzle-kit generate
   pnpm drizzle-kit migrate
   ```
3. **Verificar la compilación**:
   ```bash
   pnpm check
   ```

---

## 4. Referencias

[1] Drizzle Team. *Drizzle ORM: TypeScript ORM for SQL databases*. https://orm.drizzle.team/
[2] tRPC Team. *tRPC: End-to-end typesafe APIs made easy*. https://trpc.io/
[3] PostgreSQL Global Development Group. *PostgreSQL Documentation*. https://www.postgresql.org/docs/
[4] Expo Documentation. *Authentication and SecureStore*. https://docs.expo.dev/

---
*Documento preparado por **Manus AI** para SocialSip.*
