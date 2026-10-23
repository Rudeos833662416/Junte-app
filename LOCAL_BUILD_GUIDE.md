# Guía de Compilación Local para Android (Sin Cuota de EAS)

Si has alcanzado el límite de compilaciones gratuitas en la nube de Expo EAS, puedes generar el APK de **Sky Night** directamente en tu propio ordenador de forma totalmente gratuita.

---

## Requisitos Previos en tu Computador

1. **Node.js** (versión 18 o superior) y **pnpm** (o npm).
2. **Java Development Kit (JDK 17)** instalado.
3. **Android Studio** instalado con:
   - Android SDK
   - Android SDK Platform-Tools
   - Android SDK Build-Tools
   - Gradle

Asegúrate de configurar la variable de entorno `ANDROID_HOME` apuntando a tu SDK de Android (por ejemplo, `C:\Users\TuUsuario\AppData\Local\Android\Sdk` en Windows o `/home/usuario/Android/Sdk` en Linux/macOS).

---

## Pasos para Compilar el APK Localmente

### 1. Descargar o clonar el proyecto
Abre una terminal en la carpeta raíz del proyecto **Sky Night** (`socialsip`).

### 2. Instalar dependencias
```bash
pnpm install
```

### 3. Generar la carpeta nativa de Android
Si la carpeta `android/` no está creada o necesitas limpiarla, ejecuta:
```bash
npx expo prebuild --platform android --clean
```

### 4. Compilar el APK de depuración (Debug)
Entra a la carpeta `android` y ejecuta el comando de Gradle:

- **En Windows (Command Prompt o PowerShell):**
  ```cmd
  cd android
  gradlew assembleDebug
  ```

- **En macOS / Linux (Terminal):**
  ```bash
  cd android
  ./gradlew assembleDebug
  ```

### 5. ¿Dónde se guarda el APK?
Una vez que Gradle termine el proceso (puede tardar unos minutos la primera vez mientras descarga las dependencias de Android), encontrarás el archivo APK ejecutable en la siguiente ruta:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Puedes pasar este archivo `app-debug.apk` a tu teléfono Android mediante USB o WhatsApp e instalarlo directamente.

---

## Compilar para Producción (Release APK)
Si deseas generar un APK optimizado para producción con firma digital propia:

```bash
cd android
./gradlew assembleRelease
```
El archivo resultante se ubicará en `android/app/build/outputs/apk/release/app-release.apk`.
