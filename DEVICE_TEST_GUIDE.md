# Guía de prueba en dispositivo: SocialSip

## 1. Preparar el dispositivo

Instala **Expo Go** desde Google Play en Android o desde App Store en iPhone. El teléfono y el entorno que sirve el proyecto deben poder alcanzar la URL de Metro. Para una prueba Android nativa con la carpeta `android/`, también necesitas Android Studio, Android SDK, un emulador o un teléfono con depuración USB.

## 2. Arrancar el proyecto

Desde la raíz del proyecto:

```bash
pnpm install
pnpm check
pnpm lint
pnpm dev
```

Para abrirlo desde Expo Go, genera el QR:

```bash
pnpm qr
```

Escanea el QR desde Expo Go. En iPhone, usa la cámara o el lector integrado de Expo Go. En Android, usa el lector de Expo Go.

## 3. Inicio de sesión obligatorio

Al abrir SocialSip se muestra `app/login.tsx`. Pulsa **Continuar con Manus** y completa el OAuth en el navegador. Al volver a la app, la ruta `oauth/callback` guarda la sesión y el `AuthGate` de `app/_layout.tsx` te redirige a las pestañas.

Si cierras sesión desde Perfil, la aplicación volverá a bloquearse hasta que el usuario se autentique otra vez. Si el navegador no vuelve a la app, revisa que el esquema deep link de `app.config.ts` coincida con el bundle Android/iOS generado.

## 4. Probar ubicación real

Abre la pestaña **Mapa**. La primera vez, acepta el permiso **Mientras usas la app**. La pantalla usa `expo-location` para obtener las coordenadas y `react-native-maps` para mostrar el marcador.

En Android, comprueba en Ajustes > Aplicaciones > SocialSip > Permisos que la ubicación esté habilitada. En iOS, comprueba Ajustes > Privacidad y seguridad > Localización > SocialSip.

La ubicación real solo se obtiene en Android/iOS. La vista web muestra un aviso porque `react-native-maps` es nativo.

## 5. Probar un check-in real

En **Check-in**, pulsa **Elegir bar**. Selecciona un bar existente o pulsa **Añadir un bar**, introduce el nombre y guárdalo. Pulsa el botón principal para crear un check-in autenticado.

El check-in se guarda en la tabla `checkins`, se vincula al usuario de la sesión y actualiza el feed mediante TanStack Query. En dispositivo se programa también una notificación local de confirmación.

## 6. Probar Historias

Abre **Historias** y pulsa **Añadir foto o vídeo**. Selecciona un recurso del teléfono. Después pulsa **Música** y selecciona un archivo de audio local. Puedes escuchar una previsualización, elegir **Solo amigos** o **Público**, y pulsar **Publicar historia**.

El cliente convierte temporalmente los archivos a Base64, el servidor los sube mediante `storagePut`, y la tabla `stories` guarda las URLs, la audiencia y la caducidad de 24 horas. Las historias públicas se muestran a todos los usuarios autenticados; las de amigos requieren amistad aceptada.

## 7. Verificar privacidad

Publica una historia como **Solo amigos** y comprueba que solo sea visible para una amistad aceptada. Publica otra como **Público** y comprueba que pueda aparecer en el listado de cualquier usuario autenticado. Solo el propietario ve el botón **Eliminar** de su historia.

## 8. Android Studio

Para trabajar con Android Studio:

```bash
npx expo prebuild --platform android --no-install
npx expo run:android
```

También puedes abrir directamente la carpeta `android/` en Android Studio. Después de cambiar plugins o permisos nativos, vuelve a ejecutar `npx expo prebuild --platform android --no-install`.

Para una build distribuible con mapas Google en Android puede ser necesario configurar una API key del proveedor de mapas. Expo Go es la ruta recomendada para la primera prueba funcional.

## 9. Diagnóstico rápido

Si aparece login continuamente, revisa el callback OAuth y el deep link. Si el mapa no obtiene ubicación, revisa permisos del sistema y prueba en exterior. Si la historia no sube, revisa conexión, sesión y configuración de almacenamiento del backend. Si una historia de vídeo o audio pesa demasiado, reduce la duración o calidad antes de subirla.

## 10. Estado de esta fase

La implementación de login obligatorio, mapa nativo, check-in real, tabla/API de Historias, selección de multimedia, música local, audiencia de amigos/pública y reproducción de audio está integrada. La prueba física en Android y iOS queda como validación manual porque depende de un dispositivo, permisos del sistema y una sesión OAuth real.
