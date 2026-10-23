# Guía definitiva de autenticación estable para SocialSip

Hemos conservado absolutamente todas las funciones de SocialSip (Google OAuth, registro/login por email, check-ins, mapa con ubicación real, amigos y sección de Historias con música y privacidad) y aplicado correcciones robustas en el manejo de códigos PKCE para evitar el error `Invalid flow state`.

## 1. Solución al error `Invalid flow state` en Google OAuth

El error `Invalid flow state` ocurre cuando Supabase Auth o el sistema de deep linking intentan procesar o intercambiar el mismo código de autorización de Google dos veces (por ejemplo, al volver de la ventana del navegador y que Expo Router o un listener dispare el evento de enlace por duplicado).

**Mejoras aplicadas:**
- Se ha implementado un registro en memoria de códigos PKCE ya procesados (`exchangedAuthCodes`) en `lib/supabase.ts`. Si el código ya se intercambió, la aplicación reutiliza la sesión activa en lugar de reintentar la petición a Supabase, evitando el fallo de estado.
- La pantalla `app/auth/callback.tsx` utiliza un flujo unificado y seguro que valida el código una sola vez.

## 2. Solución al error `Email link is invalid or has expired`

Si al registrarte con correo y contraseña ves que el enlace dice que es inválido o ha caducado, se debe a dos posibles causas:
1. **El correo ya fue confirmado o el enlace es antiguo:** Los enlaces de confirmación de Supabase tienen un tiempo de validez limitado y son de un solo uso. Si intentas pulsar un correo antiguo, fallará.
2. **Confirmación obligatoria activa vs. pruebas rápidas:** Para probar rápidamente en tu dispositivo sin depender de la bandeja de entrada, puedes desactivar temporalmente la verificación de email en Supabase:
   - Entra en tu dashboard de Supabase.
   - Ve a **Authentication → Providers → Email**.
   - Desmarca **Confirm email** y pulsa **Save**.
   - Con esto, al crear un usuario nuevo, la sesión se iniciará inmediatamente sin requerir correo de confirmación. Cuando quieras publicar la app en tiendas, puedes volver a marcarlo.

## 3. Pasos recomendados para generar el nuevo APK limpio

Para asegurarte de que tu teléfono móvil tiene la última versión con todas las correcciones de estabilidad:

1. Asegúrate de que en Supabase **Authentication → URL Configuration → Redirect URLs** tengas registrada exactamente esta línea:
   ```text
   socialsip://auth/callback
   ```
2. Genera un APK completamente nuevo (el APK anterior conservaba el esquema antiguo y los problemas de callback).
3. Instala el APK nuevo en el teléfono.
4. Prueba **Continuar con Google** (asegúrate de que tu cuenta de prueba esté añadida como Test User en Google Cloud si el proyecto OAuth sigue en modo Testing).
5. Prueba el registro por correo (desactivando temporalmente `Confirm email` en Supabase para evitar demoras en las pruebas locales).
6. Disfruta de la app completa: check-ins en bares, mapa con geolocalización real, amigos y subida de Historias con música y privacidad.
