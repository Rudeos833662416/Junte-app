import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { router } from "expo-router";
import { useState } from "react";
import { Linking, Platform, Pressable, Text, View } from "react-native";

function extractProfileId(data: string) {
  try {
    const parsed = new URL(data);
    if (parsed.protocol === "socialsip:" && parsed.hostname === "profile") {
      return parsed.pathname.replace(/^\//, "");
    }
  } catch {
    // A QR can contain a raw UUID, which is also accepted below.
  }

  return data.trim();
}

export default function ScanQrScreen() {
  const colors = useColors();
  const [permission, requestPermission] = useCameraPermissions();
  const [hasScanned, setHasScanned] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const handleBarcodeScanned = ({ data }: BarcodeScanningResult) => {
    if (hasScanned) return;
    const profileId = extractProfileId(data);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(profileId)) {
      setErrorMessage("Este código no pertenece a un perfil de Tragos Sociales.");
      return;
    }

    setHasScanned(true);
    router.replace({ pathname: "/profile/[id]", params: { id: profileId } });
  };

  if (Platform.OS === "web") {
    return (
      <ScreenContainer className="items-center justify-center p-6">
        <Text className="text-xl font-bold text-foreground">Escáner QR</Text>
        <Text className="mt-2 text-center text-sm leading-5 text-muted">El escáner QR está disponible en el APK de Tragos Sociales para Android y iOS.</Text>
        <Pressable onPress={() => router.back()} style={({ pressed }) => ({ marginTop: 20, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 })}>
          <Text className="font-bold text-background">Volver</Text>
        </Pressable>
      </ScreenContainer>
    );
  }

  if (!permission) return <ScreenContainer />;

  if (!permission.granted) {
    return (
      <ScreenContainer className="items-center justify-center p-6">
        <Text className="text-xl font-bold text-foreground">Permite la cámara</Text>
        <Text className="mt-2 text-center text-sm leading-5 text-muted">Necesitamos la cámara para leer el QR del perfil de otra persona.</Text>
        <Pressable onPress={() => permission.canAskAgain ? void requestPermission() : void Linking.openSettings()} style={({ pressed }) => ({ marginTop: 20, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 })}>
          <Text className="font-bold text-background">{permission.canAskAgain ? "Permitir cámara" : "Abrir ajustes"}</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} style={({ pressed }) => ({ marginTop: 14, padding: 12, opacity: pressed ? 0.6 : 1 })}>
          <Text className="font-semibold" style={{ color: colors.primary }}>Cancelar</Text>
        </Pressable>
      </ScreenContainer>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={hasScanned ? undefined : handleBarcodeScanned}
        onMountError={(event) => setCameraError(event.message || "No se pudo iniciar la cámara.")}
      />
      <View className="absolute inset-x-0 top-0 items-center px-6 pt-16">
        <Text className="text-2xl font-bold text-white">Escanea para conectar</Text>
        <Text className="mt-2 text-center text-sm text-white/80">Apunta al código QR del perfil de Tragos Sociales.</Text>
        <View className="mt-8 h-64 w-64 rounded-3xl border-2 border-white/90" />
        {errorMessage ? <Text className="mt-4 rounded-xl bg-black/60 px-4 py-3 text-center text-sm text-white">{errorMessage}</Text> : null}
        {cameraError ? <Text className="mt-4 rounded-xl bg-red-900/80 px-4 py-3 text-center text-sm text-white">{cameraError}</Text> : null}
      </View>
      <Pressable onPress={() => router.back()} style={({ pressed }) => ({ position: "absolute", bottom: 42, alignSelf: "center", paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14, backgroundColor: "rgba(0,0,0,0.65)", opacity: pressed ? 0.65 : 1 })}>
        <Text className="font-bold text-white">Cancelar</Text>
      </Pressable>
    </View>
  );
}
