# Pruebas de autenticación de SocialSip

## A. Desactivar confirmación de email para pruebas

En Supabase abre tu proyecto y entra en:

**Authentication → Providers → Email**

Busca la opción **Confirm email** o **Confirm email signups** y desactívala. Pulsa **Save**.

Con esta opción desactivada, una cuenta nueva puede iniciar sesión inmediatamente después de registrarse y no dependerá de un enlace de correo. Esta configuración es útil durante pruebas internas. Antes de publicar SocialSip, conviene volver a activarla y configurar correctamente el correo de producción.

Para probar de nuevo, usa un email que todavía no exista en **Authentication → Users**. Si el usuario ya existe pero quedó incompleto, elimínalo desde el panel de usuarios o utiliza otra dirección de prueba.

## B. Limpiar enlaces antiguos

Los correos de confirmación que ya recibiste pueden estar vinculados a un flujo anterior o haber caducado. No reutilices esos mensajes. Después de desactivar **Confirm email**, crea un usuario nuevo y prueba el inicio de sesión directamente.

Si mantienes la confirmación activada, crea un usuario nuevo y abre el correo más reciente en el mismo teléfono donde está instalado el APK. El enlace debe volver a:

```text
socialsip://auth/callback
```

## C. Comprobar Google

En **Authentication → Providers → Google**, confirma que el proveedor está activado y guardado. En **Authentication → URL Configuration → Redirect URLs**, conserva:

```text
socialsip://auth/callback
```

En Google Cloud, el redirect URI del cliente web debe continuar siendo:

```text
https://cymhbwgxmezrwofkbdqz.supabase.co/auth/v1/callback
```

Después de instalar el APK nuevo:

1. Abre SocialSip y pulsa **Continuar con Google**.
2. Selecciona una cuenta autorizada en Google Cloud si la aplicación está en modo Testing.
3. Acepta los permisos.
4. Espera a que Android vuelva a SocialSip.
5. Comprueba que la pantalla de inicio se abre y que el usuario aparece autenticado.

## D. Si Google vuelve a mostrar `Invalid flow state`

Cierra todas las pestañas de Google/Chrome relacionadas con SocialSip, fuerza el cierre del APK, ábrelo de nuevo y repite el flujo una sola vez. No pulses varias veces el botón. Los códigos PKCE son de un solo uso.

Si persiste, desinstala el APK anterior, instala el APK nuevo y repite la prueba. El APK anterior puede conservar el esquema o el flujo de callback antiguo.

## E. Estado de código

Se actualizó el cliente para evitar intercambiar dos veces el mismo código PKCE, y la ruta `auth/callback` ahora utiliza el mismo helper de sesión. TypeScript y lint pasan. La validación definitiva requiere instalar el APK nuevo y probar Google en el teléfono.
