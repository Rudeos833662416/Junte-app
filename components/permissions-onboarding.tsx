import { useEffect, useState } from "react";
import { Modal, Platform, Pressable, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { registerPushNotifications } from "@/lib/push-notifications";

const KEY = "skynight-permissions-onboarding-v1";

export function PermissionsOnboarding() {
  const colors = useColors();
  const { user } = useAuth({ autoFetch: true });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!user || Platform.OS === "web") return;
    void AsyncStorage.getItem(`${KEY}:${user.id}`).then((value) => {
      if (!value) setVisible(true);
    });
  }, [user?.id]);

  const dismiss = async () => {
    if (!user) return;
    await AsyncStorage.setItem(`${KEY}:${user.id}`, "1");
    setVisible(false);
  };

  const accept = async () => {
    if (!user) return;
    try {
      await Location.requestForegroundPermissionsAsync();
      await registerPushNotifications(user.id);
    } catch {
      // user can deny; still mark as seen
    }
    await dismiss();
  };

  if (!visible) return null;

  return (
    <Modal visible animationType="slide" transparent>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" }}>
        <View
          style={{
            backgroundColor: colors.background,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: 20,
            paddingBottom: 32,
            gap: 12,
          }}
        >
          <Text className="text-xl font-bold text-foreground">Activa la experiencia completa</Text>
          <Text className="text-sm text-muted">
            Usamos tu ubicación para el brindis en el mapa y las notificaciones para avisarte de
            amigos, mensajes y reacciones.
          </Text>
          <Pressable
            onPress={() => void accept()}
            style={{
              backgroundColor: colors.primary,
              borderRadius: 14,
              paddingVertical: 14,
              alignItems: "center",
            }}
          >
            <Text style={{ color: colors.background, fontWeight: "700" }}>Permitir y continuar</Text>
          </Pressable>
          <Pressable onPress={() => void dismiss()} style={{ alignItems: "center", paddingVertical: 8 }}>
            <Text style={{ color: colors.muted }}>Ahora no</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
