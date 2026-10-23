# Configuración detallada de Supabase para SocialSip

Esta guía explica exactamente qué debes hacer en Supabase antes de que SocialSip pueda usar tu autenticación, base de datos e Historias fuera de Manus. Realiza los pasos en orden y no avances si el resultado de comprobación no coincide.

## Parte A. Confirmar que estás en el proyecto correcto

Abre [Supabase Dashboard](https://supabase.com/dashboard) e inicia sesión con la cuenta que creó el proyecto. En la barra superior selecciona **Sky Night's Project** —o el nombre que tenga tu proyecto— y comprueba que el identificador del proyecto sea `cymhbwgxmezrwofkbdqz`.

La URL del proyecto que utilizará SocialSip es:

```text
https://cymhbwgxmezrwofkbdqz.supabase.co
```

La URL del navegador que termina en `/settings/api-keys` es únicamente la pantalla de administración. No debes copiar esa URL como `SUPABASE_URL`.

## Parte B. Comprobar la Publishable key

En el menú izquierdo abre **Settings** —icono de engranaje— y después **API Keys**. En la parte superior verás dos pestañas parecidas a:

- **Publishable and secret API keys**.
- **Legacy anon, service_role API keys**.

Qué debes usar:

| Campo de SocialSip | Valor correcto | Qué no usar |
|---|---|---|
| `SUPABASE_URL` | `https://cymhbwgxmezrwofkbdqz.supabase.co` | La URL del Dashboard o la URL de API Keys |
| `SUPABASE_ANON_KEY` | La **Publishable key** que empieza por `sb_publishable_` | Secret key, service_role o una clave privada |

La Publishable key está pensada para ser utilizada por una aplicación cliente. Aun así, los permisos reales los controlaremos con **Row Level Security (RLS)**. La `Secret key` y la antigua `service_role` tienen privilegios elevados y nunca deben entrar en una app móvil.

En este punto no tienes que pegar nada en el SQL Editor. API Keys solo sirve para localizar las credenciales.

## Parte C. Configurar el correo de autenticación

En el menú izquierdo de Supabase abre **Authentication** y después **Providers**.

1. Busca **Email**.
2. Activa **Email provider**.
3. Mantén activada la confirmación de email si quieres que cada cuenta verifique su dirección antes de iniciar sesión. Para una primera prueba rápida puedes desactivarla temporalmente, pero para producción es más seguro mantenerla activa.
4. Pulsa **Save**.

Después abre **Authentication → URL Configuration**. Añade las URLs que utilizarás para la app. Para la primera prueba móvil, el inicio por email no necesita una URL web compleja; la confirmación de email sí puede necesitar una URL de redirección. Conserva las URLs predeterminadas de Supabase y, cuando tengamos el esquema final de Expo, añadiremos el deep link de producción.

## Parte D. Abrir el SQL Editor

Ahora sí vamos a crear las tablas. En el menú izquierdo pulsa **SQL Editor**. No pulses **API Keys**, **Table Editor** ni **Database Settings** para este paso.

En SQL Editor:

1. Pulsa el botón **New query**.
2. Verás una ventana grande de texto vacía.
3. En el proyecto SocialSip abre el archivo `supabase/migrations/0001_socialsip.sql`.
4. Copia desde la primera línea `-- SocialSip: esquema independiente...` hasta la última línea de la migración.
5. Pega todo el contenido en la ventana grande de SQL Editor.
6. No cambies las comillas, los nombres de tabla ni los puntos y comas.
7. Pulsa **Run**, normalmente en la parte inferior derecha.

La migración no inserta usuarios, bares ni historias de prueba. Crea únicamente la estructura, los índices, las políticas de seguridad, el trigger de perfiles y el bucket `stories`.

## Parte E. Qué resultado debes ver después de pulsar Run

Si la ejecución fue correcta, Supabase mostrará un mensaje parecido a **Success. No rows returned** o una confirmación de que el query terminó correctamente. Eso es normal: estamos creando estructura y no solicitando filas.

Si aparece un error, no ejecutes el script muchas veces. Copia únicamente el texto del error —sin claves— y envíamelo. El error puede indicar una tabla ya existente, un permiso o una política creada anteriormente; cada caso se corrige de forma distinta.

## Parte F. Confirmar las tablas

En el menú izquierdo abre **Table Editor**. Debes ver estas tablas dentro del esquema `public`:

| Tabla | Para qué sirve |
|---|---|
| `profiles` | Nombre, email y datos públicos básicos del usuario autenticado |
| `venues` | Bares y locales disponibles para hacer check-in |
| `friendships` | Solicitudes y amistades aceptadas |
| `checkins` | Check-ins activos y finalizados |
| `stories` | Historias de foto/vídeo, música, visibilidad y caducidad |

No debes ver que se hayan creado usuarios de prueba automáticamente. Los usuarios aparecerán en **Authentication → Users** cuando registres uno desde SocialSip.

## Parte G. Confirmar Storage

En el menú izquierdo abre **Storage**. Debe aparecer un bucket llamado `stories`.

El bucket está configurado como público para simplificar la primera prueba visual de fotos y vídeos. La escritura y eliminación siguen protegidas por políticas para que cada usuario solo pueda subir o borrar archivos dentro de su propia carpeta. Antes de publicar la app, podemos cambiarlo a bucket privado y entregar URLs firmadas con caducidad.

## Parte H. Confirmar las políticas de seguridad

En **Table Editor**, selecciona cada tabla y abre la sección **Policies** o **RLS policies**. Debe estar activado RLS en:

- `profiles`.
- `venues`.
- `friendships`.
- `checkins`.
- `stories`.

RLS significa que la Publishable key no concede acceso ilimitado: cada consulta se evalúa según el usuario autenticado. Por ejemplo, un usuario puede crear su propio check-in, pero no debería poder crear un check-in atribuido a otra cuenta.

## Parte I. Crear la primera cuenta desde SocialSip

Cuando las tablas estén creadas, vuelve al proyecto y responde **SQL terminado**. Después conectaré las pantallas de SocialSip a Supabase.

Para probar el registro:

1. Abre SocialSip.
2. En la pantalla de login pulsa **Crear una cuenta**.
3. Escribe tu nombre.
4. Escribe un email al que tengas acceso.
5. Escribe una contraseña de al menos 6 caracteres.
6. Pulsa **Crear cuenta**.
7. Si la confirmación de email está activa, abre el correo de Supabase y pulsa el enlace.
8. Vuelve a SocialSip e inicia sesión.

El usuario aparecerá en **Authentication → Users**. El trigger creará automáticamente su fila en `profiles`.

## Parte J. Qué no debes hacer

No pegues la Publishable key ni ninguna Secret key en SQL Editor. No pegues contraseñas en el chat. No utilices `service_role` dentro de `app.config.ts`, React Native, Expo Go, Android Studio ni Git. No borres tablas desde Table Editor mientras estamos migrando; si aparece un conflicto, conserva el error y lo corregiremos con una migración específica.

## Comprobación final de esta fase

La fase queda correctamente terminada cuando se cumplen las siguientes condiciones:

- El proyecto activo tiene el identificador `cymhbwgxmezrwofkbdqz`.
- `SUPABASE_URL` apunta a `https://cymhbwgxmezrwofkbdqz.supabase.co`.
- `SUPABASE_ANON_KEY` contiene la Publishable key `sb_publishable_...`.
- La prueba automática de conexión de SocialSip pasa correctamente.
- SQL Editor muestra ejecución exitosa.
- Table Editor muestra `profiles`, `venues`, `friendships`, `checkins` y `stories`.
- Storage muestra el bucket `stories`.
- RLS aparece activado en las cinco tablas.

Cuando termines solo tienes que responder **SQL terminado**. No necesitas enviarme capturas ni claves.
