// Load environment variables with proper priority (system > .env)
import "./scripts/load-env.js";
import type { ExpoConfig } from "expo/config";

const rawBundleId = "app.junta2";
const bundleId =
  rawBundleId
    .replace(/[-_]/g, ".")
    .replace(/[^a-zA-Z0-9.]/g, "")
    .replace(/\.+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .toLowerCase()
    .split(".")
    .map((segment) => {
      return /^[a-zA-Z]/.test(segment) ? segment : "x" + segment;
    })
    .join(".") || "space.manus.app";
const schemeFromBundleId = "socialsip";
const env = {
  appName: "Junta2",
  appSlug: "junte-app",
  logoUrl: "/manus-storage/icon_d4ee1ac1.png",
  appSubtitle: "Tus panas, tu plan, tu junte",
  scheme: schemeFromBundleId,
  iosBundleId: bundleId,
  androidPackage: bundleId,
};

const config: ExpoConfig = {
  name: env.appName,
  slug: env.appSlug,
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/brand/icon.png",
  scheme: env.scheme,
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: env.iosBundleId,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSLocationWhenInUseUsageDescription:
        "Junta2 necesita acceso a tu ubicación para mostrar dónde están tus amigos.",
      NSLocationAlwaysAndWhenInUseUsageDescription:
        "Junta2 necesita acceso a tu ubicación mientras usas el mapa y el descubrimiento cercano.",
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#FC4C02",
      foregroundImage: "./assets/brand/adaptive-foreground.png",
      monochromeImage: "./assets/brand/adaptive-monochrome.png",
    },
    edgeToEdgeEnabled: true,
    softwareKeyboardLayoutMode: "resize",
    predictiveBackGestureEnabled: false,
    package: env.androidPackage,
      googleServicesFile: "./google-services.json",
    permissions: ["POST_NOTIFICATIONS"],
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          {
            scheme: env.scheme,
            host: "*",
          },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/brand/icon.png",
  },
  owner: "jesusjunteapps-team",
  extra: {
    appSubtitle: env.appSubtitle,
    googleMapsApiKey:
      process.env.GOOGLE_MAPS_API_KEY?.trim() ||
      process.env.Places?.trim() ||
      process.env.GOOGLE_PLACES_API_KEY?.trim() ||
      "",
    eas: { projectId: "a595b360-16d9-40e4-9df4-7a3630257f39" },
    supabaseUrl: process.env.SUPABASE_URL ?? "https://cymhbwgxmezrwofkbdqz.supabase.co",
    supabaseAnonKey:
      process.env.SUPABASE_ANON_KEY ?? "sb_publishable_V-Tjv6qV2JaEdXyumlGZ8w_HbdPp7iD",
  },
  plugins: [
    "expo-router",
    "expo-font",
    "expo-web-browser",
    "./plugins/with-google-maps-android.js",
    "expo-location",
    "expo-notifications",
    "expo-image-picker",
    "expo-document-picker",
    [
      "expo-camera",
      {
        cameraPermission: "Junta2 necesita la cámara para escanear códigos QR de amistad.",
        microphonePermission: "Junta2 necesita el micrófono solo si grabas vídeo con audio.",
        recordAudioAndroid: false,
      },
    ],
    [
      "expo-audio",
      {
        microphonePermission: "Allow $(PRODUCT_NAME) to access your microphone.",
      },
    ],
    [
      "expo-video",
      {
        supportsBackgroundPlayback: true,
        supportsPictureInPicture: true,
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/brand/splash.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#0A0A0A",
        dark: {
          backgroundColor: "#0A0A0A",
        },
      },
    ],
    [
      "expo-build-properties",
      {
        android: {
          buildArchs: ["armeabi-v7a", "arm64-v8a"],
          minSdkVersion: 24,
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
