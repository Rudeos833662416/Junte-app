# SocialSip — Guía de edición y ejecución

## Qué contiene este paquete

Este proyecto contiene el código fuente compartido de SocialSip para iOS y Android, la configuración Expo/React Native, los assets de branding, la documentación de diseño, las pantallas de la aplicación y una carpeta `android/` generada mediante Expo Prebuild para abrir el proyecto nativo en Android Studio.

| Carpeta o archivo | Uso |
|---|---|
| `app/` | Pantallas y rutas de Expo Router |
| `components/` | Componentes reutilizables e iconos |
| `assets/images/` | Icono, splash, favicon y adaptive icon |
| `android/` | Proyecto Android nativo generado para Android Studio |
| `app.config.ts` | Nombre, slug, bundle IDs, permisos y plugins |
| `theme.config.js` | Colores del producto |
| `design.md` | Decisiones de diseño y alcance |
| `todo.md` | Seguimiento de funcionalidades |
| `package.json` | Scripts y dependencias |

## Opción recomendada: editar el código compartido

Instala Node.js 22 o una versión LTS compatible, pnpm y las dependencias del proyecto. Desde la raíz de SocialSip ejecuta:

```bash
pnpm install
pnpm dev
```

Para revisar la aplicación en el navegador puedes abrir el preview de Expo. Para probarla en Expo Go, usa el QR generado por Expo en una red accesible desde el dispositivo.

## Abrir en Android Studio

Abre **la carpeta `android/`**, no la raíz completa del proyecto, en Android Studio. Deja que Gradle sincronice el proyecto y selecciona un emulador o dispositivo físico con depuración USB activada.

Antes de abrir Android Studio por primera vez, instala Android Studio, Android SDK, Android SDK Platform, Android SDK Build-Tools y un emulador compatible. El paquete se generó con `expo prebuild --platform android --no-install`, por lo que la carpeta nativa refleja la configuración actual de `app.config.ts`.

Desde la raíz del proyecto también puedes ejecutar:

```bash
pnpm install
npx expo run:android
```

Este comando compila e instala la aplicación en un emulador o dispositivo conectado. El proceso puede descargar componentes Gradle adicionales la primera vez.

## Editar en VS Code

Abre la raíz del proyecto, `/socialsip`, en VS Code. Los archivos habituales para modificar la interfaz son:

```text
app/(tabs)/index.tsx
app/(tabs)/friends.tsx
app/(tabs)/map.tsx
app/(tabs)/activity.tsx
app/(tabs)/profile.tsx
components/ui/icon-symbol.tsx
theme.config.js
app.config.ts
```

Después de modificar pantallas compartidas, vuelve a generar la carpeta Android si cambias plugins, permisos, iconos o configuración nativa:

```bash
npx expo prebuild --platform android --clean
```

Usa `--clean` solo cuando quieras regenerar los archivos nativos. Guarda antes cualquier modificación manual realizada dentro de `android/`, porque Prebuild puede reemplazar cambios nativos.

## Exportar un APK de prueba

Desde la raíz del proyecto, con Android SDK correctamente configurado, puedes usar:

```bash
npx expo run:android
```

Para un APK de release, configura primero el método de firma Android y la cuenta/proyecto de distribución que vayas a utilizar. La generación de un APK firmado para publicación no está incluida en esta entrega porque depende de tus credenciales de firma y del destino de distribución.

## Notas importantes

La versión actual incluye una confirmación local de check-in en dispositivos native. La sincronización entre usuarios, autenticación, geolocalización real, base de datos y push remoto requieren implementar la siguiente fase de backend.

La carpeta `android/` es un resultado generado. La fuente principal sigue siendo Expo/React Native y permite mantener una base compartida para iOS y Android.

No subas al repositorio credenciales, keystores, contraseñas ni archivos `.env` con secretos. Para cambiar el nombre o el icono, actualiza `app.config.ts` y los assets de `assets/images/`, y regenera Android con Prebuild.

## Comprobaciones disponibles

```bash
pnpm check
pnpm lint
```

Ambos comandos deben ejecutarse desde la raíz del proyecto. `pnpm check` valida TypeScript y `pnpm lint` revisa el estilo y reglas del proyecto.

## Resumen

Para editar la interfaz: abre la raíz en VS Code. Para editar el proyecto nativo Android: abre `android/` en Android Studio. Para volver a generar la capa nativa después de cambiar configuración Expo: ejecuta `npx expo prebuild --platform android --clean` con precaución.

> SocialSip: avisa, encuentra y únete.
