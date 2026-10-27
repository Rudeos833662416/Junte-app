// Load environment variables with proper priority (system > .env)
import "./scripts/load-env.js";
import type { ExpoConfig } from "expo/config";

// Bundle ID format: space.manus.<project_name_dots>.<timestamp>
// e.g., "my-app" created at 2024-01-15 10:30:45 -> "space.manus.my.app.t20240115103045"
// Bundle ID can only contain letters, numbers, and dots
// Android requires each dot-separated segment to start with a letter
const rawBundleId = "com.app.socialsip";
const bundleId =
  rawBundleId
    .replace(/[-_]/g, ".") // Replace hyphens/underscores with dots
    .replace(/[^a-zA-Z0-9.]/g, "") // Remove invalid chars
    .replace(/\.+/g, ".") // Collapse consecutive dots
    .replace(/^\.+|\.+$/g, "") // Trim leading/trailing dots
    .toLowerCase()
    .split(".")
    .map((segment) => {
      // Android requires each segment to start with a letter
      // Prefix with 'x' if segment starts with a digit
      return /^[a-zA-Z]/.test(segment) ? segment : "x" + segment;
    })
    .join(".") || "space.manus.app";
// Extract timestamp from bundle ID and prefix with "manus" for deep link scheme
// e.g., "space.manus.my.app.t20240115103045" -> "manus20240115103045"
const timestamp = bundleId.split(".").pop()?.replace(/^t/, "") ?? "";
const schemeFromBundleId = "socialsip";
const env = {
  // App branding - update these values directly (do not use env vars)
  appName: "Tragos Sociales",
  appSlug: "socialsip",
  // S3 URL of the app logo - set this to the URL returned by generate_image when creating custom logo
  // Leave empty to use the default icon from assets/images/icon.png
  logoUrl: "/manus-storage/icon_d4ee1ac1.png",
  appSubtitle: "time to drink",
  scheme: schemeFromBundleId,
  iosBundleId: bundleId,
  androidPackage: bundleId,
};

const config: ExpoConfig = {
  name: env.appName,
  slug: env.appSlug,
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: env.scheme,
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: env.iosBundleId,
    "infoPlist": {
        "ITSAppUsesNonExemptEncryption": false,
        "NSLocationWhenInUseUsageDescription": "Tragos Sociales necesita acceso a tu ubicación para mostrar dónde están tus amigos.",
        "NSLocationAlwaysAndWhenInUseUsageDescription": "Tragos Sociales necesita acceso a tu ubicación mientras usas el mapa y el descubrimiento cercano."
      }
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    package: env.androidPackage,
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
    favicon: "./assets/images/favicon.png",
  },
  owner: "rudeosgreyrad416",
  extra: {
    appSubtitle: env.appSubtitle,
    // Read by the native config plugin during Expo prebuild; never hardcode the key.
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ?? "",
    eas: { projectId: "937e4d3e-fb8b-481d-ab99-d06ef34e7709" },
    // These are Supabase public client values; RLS protects database access.
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
        cameraPermission: "Tragos Sociales necesita la cámara para escanear códigos QR de amistad.",
        microphonePermission: "Tragos Sociales necesita el micrófono solo si grabas vídeo con audio.",
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
        image: "./assets/images/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#ffffff",
        dark: {
          backgroundColor: "#000000",
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
