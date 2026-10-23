# Corrección del correo de confirmación en el APK

El problema ocurre porque Supabase tenía una URL de desarrollo como `localhost:3000`. Un teléfono no puede abrir el `localhost` del ordenador como si fuera la aplicación. SocialSip ya está preparado para usar el esquema móvil:

```text
socialsip://auth/callback
```

## 1. Añadir el redirect permitido en Supabase

Entra en tu proyecto de Supabase y abre:

**Authentication → URL Configuration**

Busca el bloque llamado **Redirect URLs** o **Additional Redirect URLs**. Añade una nueva URL exactamente así:

```text
socialsip://auth/callback
```

Pulsa **Save**.

No pongas esta URL en **API Keys**. No reemplaces la URL del proyecto `https://cymhbwgxmezrwofkbdqz.supabase.co`; esa URL sigue siendo la dirección de la API.

Si Supabase también muestra un campo **Site URL**, puedes dejarlo con la URL web predeterminada. Para el APK, lo importante es que `socialsip://auth/callback` aparezca en la lista de **Redirect URLs**.

## 2. Por qué hace falta generar otro APK

El esquema `socialsip` se registra dentro del Android Manifest cuando se compila la aplicación. El APK antiguo fue construido antes de este cambio, por lo que no conoce necesariamente el nuevo callback. Después de guardar la configuración, debes generar un APK nuevo e instalarlo en el teléfono sustituyendo el anterior.

Para una compilación local de desarrollo, desde la raíz del proyecto puedes usar:

```bash
pnpm install
npx expo prebuild --platform android
npx expo run:android
```

Para una compilación distribuible mediante EAS:

```bash
npm install --global eas-cli
eas login
eas build:configure
eas build --platform android
```

La compilación de producción necesita que tu cuenta de Expo/EAS y tus credenciales Android estén configuradas. No reutilices el APK anterior para comprobar este cambio.

## 3. Probar el flujo correcto

1. Instala el APK nuevo.
2. Abre SocialSip.
3. Pulsa **Crear una cuenta**.
4. Introduce nombre, email y contraseña.
5. Abre el correo de confirmación en el mismo teléfono.
6. Pulsa el botón de confirmación.
7. Android debe abrir SocialSip automáticamente.
8. La pantalla `auth/callback` intercambia el código de Supabase y abre las pestañas de SocialSip.

## 4. Resultado esperado

El enlace del correo debe tener un destino parecido a:

```text
socialsip://auth/callback?code=...
```

No debe terminar en:

```text
http://localhost:3000
```

Si el correo continúa mostrando `localhost:3000`, revisa que el enlace de Supabase esté guardado en **Authentication → URL Configuration → Redirect URLs** y que la cuenta se haya creado desde el APK nuevo después de guardar esa configuración.

## 5. Cambios aplicados en el código

- `app.config.ts` utiliza el esquema estable `socialsip`.
- `lib/supabase.ts` exporta `SUPABASE_AUTH_REDIRECT` con valor `socialsip://auth/callback`.
- `app/login.tsx` envía `emailRedirectTo` al registrar una cuenta.
- `app/auth/callback.tsx` intercambia el código PKCE y redirige al usuario a las pestañas.
- `app/_layout.tsx` permite la ruta `auth/callback` sin enviarla de vuelta al login.

