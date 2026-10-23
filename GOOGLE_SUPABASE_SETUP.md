# Configurar “Continuar con Google” en SocialSip

El botón ya está implementado en la app y TypeScript/lint pasan correctamente. Antes de generar el APK nuevo, debes activar Google en tu proyecto Supabase y crear las credenciales OAuth en Google Cloud.

## 1. Crear o seleccionar un proyecto en Google Cloud

1. Abre [Google Cloud Console](https://console.cloud.google.com/).
2. Inicia sesión con la cuenta que administrará SocialSip.
3. En la parte superior pulsa el selector de proyecto.
4. Pulsa **New Project** si todavía no tienes uno para SocialSip.
5. Pon un nombre como `SocialSip` y pulsa **Create**.
6. Comprueba que el proyecto nuevo está seleccionado antes de continuar.

## 2. Configurar la pantalla de consentimiento OAuth

1. En Google Cloud abre **Google Auth Platform** o busca **OAuth consent screen**.
2. Selecciona **External** si permitirás cuentas de usuarios fuera de tu organización.
3. Completa el nombre de la aplicación: `SocialSip`.
4. Introduce el email de soporte y el email de contacto del desarrollador.
5. Guarda y continúa.
6. Si Google solicita scopes, mantén inicialmente los básicos de identidad: email, perfil y openid.
7. Si la aplicación está en modo **Testing**, añade las cuentas Google que utilizarás para probarla como **Test users**.

Para una primera prueba no necesitas publicar la aplicación de Google. Una cuenta añadida como usuario de prueba puede iniciar sesión mientras el proyecto esté en Testing.

## 3. Crear el Client ID web para Supabase

Aunque los usuarios entren desde el APK, Supabase necesita un OAuth Client ID de tipo **Web application** para completar el intercambio con Google.

1. En Google Cloud abre **Google Auth Platform → Clients**. En la interfaz antigua, abre **APIs & Services → Credentials**.
2. Pulsa **Create Client** o **Create Credentials → OAuth client ID**.
3. Selecciona **Web application**.
4. Pon el nombre `SocialSip Supabase Web Client`.
5. En **Authorized JavaScript origins**, añade si usarás el proyecto web:

```text
https://socialsip-xbdn933n.manus.space
```

6. En **Authorized redirect URIs** añade exactamente la URI que Supabase muestra dentro de la configuración del proveedor Google. Normalmente tiene este formato:

```text
https://cymhbwgxmezrwofkbdqz.supabase.co/auth/v1/callback
```

Usa siempre la URI que aparece en el panel Supabase para evitar errores de coincidencia.

7. Pulsa **Create**.
8. Google mostrará un **Client ID** y un **Client secret**. El Client secret es privado; no lo pegues en el chat ni en el código de la app.

## 4. Activar Google en Supabase

1. Abre tu proyecto Supabase.
2. Entra en **Authentication → Providers**.
3. Busca **Google** y actívalo.
4. Pega el **Client ID** de Google en el campo correspondiente.
5. Pega el **Client secret** de Google en el campo correspondiente.
6. Guarda los cambios.

No pegues el Client secret en `app.config.ts`, en React Native, en Android Studio ni en Git. Solo debe permanecer en la configuración segura del proveedor Google de Supabase.

## 5. Confirmar los redirects de Supabase

En Supabase abre **Authentication → URL Configuration → Redirect URLs** y confirma que esté esta URL:

```text
socialsip://auth/callback
```

La configuración tiene dos URLs diferentes y ambas son necesarias:

| Lugar | URL |
|---|---|
| Google Cloud, Authorized redirect URI | `https://cymhbwgxmezrwofkbdqz.supabase.co/auth/v1/callback` |
| Supabase, Redirect URLs de la app | `socialsip://auth/callback` |

La primera URL es el callback interno de Supabase con Google. La segunda es el retorno final desde Supabase hacia tu APK.

## 6. Probar Google antes de generar el APK

La aplicación ya contiene el botón **Continuar con Google**. El flujo será:

1. El usuario pulsa el botón.
2. Supabase abre Google en una ventana segura.
3. Google autentica al usuario.
4. Google devuelve el resultado al callback de Supabase.
5. Supabase redirige a `socialsip://auth/callback`.
6. Android abre SocialSip.
7. SocialSip intercambia el código PKCE y crea la sesión persistente.

Si recibes un error `redirect_uri_mismatch`, revisa primero la URL de Google Cloud. Debe ser la callback `https://cymhbwgxmezrwofkbdqz.supabase.co/auth/v1/callback`, no `socialsip://auth/callback`.

Si recibes un error `provider is not enabled`, guarda primero el proveedor Google en Supabase.

Si Google funciona pero el teléfono no vuelve a la app, instala el APK nuevo generado después de este cambio; el APK anterior no contiene necesariamente el esquema `socialsip`.

## 7. Qué necesito de ti ahora

No necesito que me envíes el Client secret. Solo realiza estos pasos en Google Cloud y Supabase. Cuando el proveedor Google esté activado y guardado, responde **Google activado**. Entonces validaré el proyecto y prepararé la compilación del APK nuevo.

