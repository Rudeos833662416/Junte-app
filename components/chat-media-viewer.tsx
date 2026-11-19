import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, Platform, Pressable, Share, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { MaterialIcons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";

type Props = {
  visible: boolean;
  uri: string | null;
  kind: "image" | "video" | null;
  onClose: () => void;
};

function ViewerVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.play();
  });
  useEffect(() => {
    return () => {
      try {
        player.pause();
      } catch {
        /* released */
      }
    };
  }, [player]);
  return (
    <VideoView
      player={player}
      style={{ width: "100%", height: "70%" }}
      contentFit="contain"
      nativeControls
    />
  );
}

export function ChatMediaViewer({ visible, uri, kind, onClose }: Props) {
  const { width, height } = useWindowDimensions();
  const [saving, setSaving] = useState(false);

  const saveToDevice = async () => {
    if (!uri || saving) return;
    setSaving(true);
    try {
      let localUri = uri;
      if (uri.startsWith("http://") || uri.startsWith("https://")) {
        const ext = kind === "video" ? "mp4" : "jpg";
        const dest = `${FileSystem.cacheDirectory}chat_save_${Date.now()}.${ext}`;
        const result = await FileSystem.downloadAsync(uri, dest);
        localUri = result.uri;
      }
      await Share.share(
        Platform.OS === "ios"
          ? { url: localUri }
          : { url: localUri, message: kind === "video" ? "Vídeo de Junte" : "Foto de Junte" },
      );
    } catch {
      Alert.alert("No se pudo compartir", "Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  if (!visible || !uri || !kind) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.94)", justifyContent: "center", alignItems: "center" }}>
        <View style={{ position: "absolute", top: 48, right: 12, zIndex: 2, flexDirection: "row", gap: 8 }}>
          <Pressable
            onPress={() => void saveToDevice()}
            accessibilityRole="button"
            accessibilityLabel="Guardar o compartir"
            style={{ padding: 8, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 20 }}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color="#FFF" /> : <MaterialIcons name="download" size={26} color="#FFFFFF" />}
          </Pressable>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
            style={{ padding: 8, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 20 }}
          >
            <MaterialIcons name="close" size={26} color="#FFFFFF" />
          </Pressable>
        </View>
        {kind === "image" ? (
          <Image
            source={{ uri }}
            style={{ width: width, height: height * 0.8 }}
            contentFit="contain"
            cachePolicy="disk"
          />
        ) : (
          <ViewerVideo uri={uri} />
        )}
      </View>
    </Modal>
  );
}
