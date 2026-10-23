# Notas de implementación: SocialSip

## Referencias consultadas

- Expo Location SDK 54: `/home/ubuntu/socialsip_helper/docs/location/location/DOCS.md`. `expo-location` permite solicitar `requestForegroundPermissionsAsync()` y obtener coordenadas con `getCurrentPositionAsync()` en Android, iOS y web.
- React Native Maps: `/home/ubuntu/socialsip_helper/docs/location/maps/DOCS.md`. `react-native-maps` funciona de forma nativa en Android/iOS; Expo Go no requiere configuración adicional para probarlo, mientras que una build distribuible de Android requiere configurar Google Maps SDK y API key.
- Expo ImagePicker: `/home/ubuntu/socialsip_helper/docs/media/imagepicker/DOCS.md`. Se debe comprobar `result.canceled` antes de acceder a `result.assets`; para cámara se debe pedir permiso explícito.
- Expo Audio: `/home/ubuntu/socialsip_helper/docs/media/audio/DOCS.md`. `expo-audio` usa `useAudioPlayer()` y `setAudioModeAsync({ playsInSilentMode: true })` para reproducción en iOS y Android.
- Expo DocumentPicker: `/home/ubuntu/socialsip_helper/docs/storage/document-picker/DOCS.md`. Se debe comprobar cancelación y copiar a caché; en iOS los URI seleccionados pueden ser temporales.
- Expo FileSystem: `/home/ubuntu/socialsip_helper/docs/storage/filesystem/DOCS.md`. Para cargas temporales se usa la caché; la lectura Base64 permite enviar archivos al backend.
- Backend móvil Manus: `/home/ubuntu/skills/webdev-readme-mobile-backend/SKILL.md`. `protectedProcedure` exige sesión; las subidas multimedia deben pasar por almacenamiento S3 mediante las utilidades del servidor; las migraciones Drizzle se generan y revisan antes de aplicarse.

## Estado técnico actual

SocialSip ahora incluye una pantalla `app/login.tsx`, un `AuthGate` en `app/_layout.tsx`, y la pantalla de OAuth existente en `app/oauth/callback.tsx`. La aplicación redirige al login cuando no hay sesión y permite `(tabs)` y `oauth/callback` durante la autenticación.

La variante nativa del mapa se encuentra en `app/(tabs)/map.native.tsx` y usa `expo-location` y `react-native-maps`. La variante web segura se encuentra en `app/(tabs)/map.tsx` para evitar importar módulos nativos en el bundle web.

La tabla `stories` se encuentra en `drizzle/schema.ts`, con `mediaUrl`, `mediaType`, `audioUrl`, `audioName`, `caption`, `visibility`, `createdAt` y `expiresAt`. Las tablas faltantes `venues`, `checkins`, `friendships` y `stories` fueron creadas en la base de datos con SQL no destructivo. El router `server/routers.ts` expone `socialsip.stories.list/create/remove`, además de `venues.list/create`, `checkin` y `feed`.

La pantalla `app/(tabs)/stories.tsx` permite seleccionar foto/vídeo, elegir música local con `expo-document-picker`, reproducir la música seleccionada, elegir audiencia `friends` o `public`, cargar el archivo en Base64 al backend y listar historias vigentes durante 24 horas.

El check-in de `app/(tabs)/index.tsx` ya no usa delay simulado: lista bares mediante tRPC, permite crear uno y registra el check-in autenticado en la base de datos.

## Fuentes externas

[1] Expo Location: https://docs.expo.dev/versions/latest/sdk/location/
[2] React Native Maps: https://github.com/react-native-maps/react-native-maps
[3] Expo ImagePicker: https://docs.expo.dev/versions/latest/sdk/imagepicker/
[4] Expo Audio: https://docs.expo.dev/versions/latest/sdk/audio/
[5] Expo DocumentPicker: https://docs.expo.dev/versions/latest/sdk/document-picker/
[6] Expo FileSystem: https://docs.expo.dev/versions/latest/sdk/filesystem/
[7] Drizzle ORM: https://orm.drizzle.team/
[8] tRPC: https://trpc.io/

## Próximas comprobaciones

La exportación web debe repetirse después de la separación `map.native.tsx` / `map.tsx`. Antes del checkpoint final se debe ejecutar `pnpm check`, `pnpm lint`, `pnpm test`, `npx expo prebuild --platform android --no-install` y probar el QR en un dispositivo Android o iOS. La build de producción Android con Google Maps puede requerir API key y permisos nativos según el proveedor de mapas.
