import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, Platform, Pressable, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { getPushRegistrationDiagnostic, registerPushNotifications } from "@/lib/push-notifications";

const KEY = "skynight-permissions-onboarding-v1";

export function PermissionsOnboarding() {
  const colors = useColors();
  const { user } = useAuth({ autoFetch: true });
  const [visible, setVisible] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (!user || Platform.OS === "web") return;
    void AsyncStorage.getItem(`${KEY}:${user.id}`).then((value) => {
      if (!value) setVisible(true);
    });
  }, [user?.id]);

  const dismiss = async () => {
    if (!user || isProcessing) return;
    await AsyncStorage.setItem(`${KEY}:${user.id}`, "1");
    setVisible(false);
  };

  const accept = async () => {
    if (!user || isProcessing) return;
    setIsProcessing(true);
    try {
      const locationPermission = await Location.requestForegroundPermissionsAsync();
      if (locationPermission.status !== Location.PermissionStatus.GRANTED) {
        Alert.alert("Ubicación no activada", "No se pudo obtener el permiso de ubicación. Puedes activarlo después desde Perfil.");
      }

      const token = await registerPushNotifications(user.id);
      if (!token) {
        const diagnostic = await getPushRegistrationDiagnostic(user.id);
        const stage = diagnostic?.stage ?? "registro del dispositivo";
        const message = diagnostic?.message ?? "No se pudo registrar el dispositivo.";
        Alert.alert("Notificaciones no activadas", `Punto del fallo: ${stage}\n\n${message}`, [
          { text: "Cerrar", style: "cancel" },
          { text: "Reintentar", onPress: () => void accept() },
        ]);
        return;
      }
      await dismiss();
    } catch {
      Alert.alert("Error al activar notificaciones", "No pudimos completar los permisos. Revisa la configuración del teléfono e inténtalo de nuevo.", [
        { text: "Cerrar", style: "cancel" },
        { text: "Reintentar", onPress: () => void accept() },
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible animationType="slide" transparent>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" }}>
        <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32, gap: 12 }}>
          <Text className="text-xl font-bold text-foreground">Activa la experiencia completa</Text>
          <Text className="text-sm text-muted">Usamos tu ubicación para el brindis en el mapa y las notificaciones para avisarte de amigos, mensajes y reacciones.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Permitir ubicación y notificaciones"
            disabled={isProcessing}
            onPress={() => void accept()}
            style={({ pressed }) => ({ backgroundColor: colors.primary, borderRadius: 14, minHeight: 52, alignItems: "center", justifyContent: "center", opacity: isProcessing ? 0.6 : pressed ? 0.82 : 1 })}
          >
            {isProcessing ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={{ color: colors.onPrimary, fontWeight: "700" }}>Permitir y continuar</Text>}
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Ahora no" disabled={isProcessing} onPress={() => void dismiss()} style={{ alignItems: "center", paddingVertical: 8, minHeight: 44, justifyContent: "center" }}>
            <Text style={{ color: colors.muted }}>Ahora no</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
