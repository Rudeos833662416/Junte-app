const { withAndroidManifest } = require("@expo/config-plugins");

/**
 * Inyecta la clave de Google Maps en el AndroidManifest durante expo prebuild.
 * Si no hay GOOGLE_MAPS_API_KEY, no falla el build: deja un placeholder y avisa.
 * Para mapas reales en producción, define GOOGLE_MAPS_API_KEY como secreto EAS.
 */
module.exports = function withGoogleMapsAndroid(config) {
  return withAndroidManifest(config, (manifestConfig) => {
    const fromEnv = process.env.GOOGLE_MAPS_API_KEY?.trim();
    const fromExtra =
      typeof config.extra?.googleMapsApiKey === "string"
        ? config.extra.googleMapsApiKey.trim()
        : "";
    const apiKey = fromEnv || fromExtra || "";

    if (!apiKey) {
      console.warn(
        "[with-google-maps-android] GOOGLE_MAPS_API_KEY no está definida. " +
          "El APK compilará, pero el mapa nativo de Google no cargará hasta que configures la clave en EAS Secrets o en el entorno de build.",
      );
    }

    const application = manifestConfig.modResults.manifest.application?.[0];
    if (!application) return manifestConfig;

    const metadata = application["meta-data"] ?? [];
    const keyMetadata = {
      $: {
        "android:name": "com.google.android.geo.API_KEY",
        "android:value": apiKey || "MISSING_GOOGLE_MAPS_API_KEY",
      },
    };
    const existingIndex = metadata.findIndex(
      (item) => item.$?.["android:name"] === "com.google.android.geo.API_KEY",
    );

    if (existingIndex >= 0) {
      metadata[existingIndex] = keyMetadata;
    } else {
      metadata.push(keyMetadata);
    }
    application["meta-data"] = metadata;

    return manifestConfig;
  });
};
