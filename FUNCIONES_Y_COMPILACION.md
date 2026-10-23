# Tragos Sociales: funciones y compilación

## Funciones incluidas

Esta versión contiene una aplicación social para check-ins en bares, con identidad visual oscura de medianoche, plata y blanco. La autenticación usa Supabase con correo y contraseña, persistencia de sesión y acceso mediante Google OAuth configurado para el esquema móvil `socialsip`.

La pantalla principal permite seleccionar un lugar de bebida, buscar lugares por dirección o cercanía, seleccionar coordenadas en el mapa y hacer check-in o check-out. Los datos de lugares y check-ins se consultan desde Supabase; no se incluyen datos ficticios como contenido funcional.

La sección Amigos permite consultar perfiles y estados sociales, abrir perfiles públicos y usar el escáner QR para conectar con otros usuarios. El perfil incluye foto de perfil, foto de portada, edición del nombre con límite temporal, biografía breve, privacidad y acceso a historias. Las historias admiten contenido multimedia, música, expiración de 24 horas y opciones de audiencia según las migraciones aplicadas en Supabase.

La sección Actividad muestra notificaciones y reacciones de actividad. La sección Mapa muestra la ubicación del usuario y la información de check-ins disponibles según permisos y datos de Supabase. La interfaz incorpora refresco al volver a primer plano, suscripciones Realtime donde están implementadas, caché de imágenes, controles de permisos de ubicación y cámara, y feedback háptico en dispositivos nativos.

La integración de notificaciones conserva el módulo `expo-notifications` para APK y development builds nativas: permisos Android, canal, token Expo, recepción, interacción y navegación asociada. Expo Go Android no puede ejecutar notificaciones push remotas desde SDK 53; por eso la aplicación evita invocar esa parte incompatible dentro de Expo Go, sin eliminarla de la build nativa. Las notificaciones locales y las funciones restantes de la interfaz siguen disponibles según el entorno.

## Contenido técnico

El proyecto incluye TypeScript, Expo Router, React Native, NativeWind, Supabase, migraciones SQL, assets de marca, configuración Android/Expo, scripts de validación y `eas.json` con `pnpm 9.12.0`, APK interna e imagen Java 17 para EAS. `node_modules`, cachés, APKs anteriores, ZIPs y archivos temporales se excluyen del paquete para evitar errores de espacio y cargas innecesarias.

## Compilación desde Linux

Después de descomprimir el ZIP, ejecuta:

```bash
cd /ruta/TragosSociales-Complete
export NVM_DIR="$HOME/.config/nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 20
corepack enable
corepack prepare pnpm@9.12.0 --activate
pnpm install --frozen-lockfile
npx expo-doctor
pnpm check
```

Para crear una copia pequeña y subirla a EAS:

```bash
bash scripts/create-eas-build-copy.sh "$PWD" "$HOME/TragosSociales-EAS"
cd "$HOME/TragosSociales-EAS"
npx eas-cli@latest build --platform android --profile preview
```

Instala la APK desde el enlace que entregue EAS. Para probar notificaciones push reales utiliza la APK o una development build en un teléfono físico; Expo Go Android no es el entorno válido para esa función.

## Configuración externa necesaria

La aplicación requiere que las migraciones SQL incluidas en `supabase/migrations/` se hayan ejecutado en el proyecto Supabase correspondiente, que Google OAuth tenga permitido `socialsip://auth/callback`, y que las claves públicas estén disponibles mediante `SUPABASE_URL` y `SUPABASE_ANON_KEY` o mediante la configuración incluida. Las políticas RLS y los buckets de Storage deben existir para perfiles, portadas e historias.
