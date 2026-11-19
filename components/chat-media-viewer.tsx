import { Modal, Pressable, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { MaterialIcons } from "@expo/vector-icons";
import { useEffect } from "react";

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
  if (!visible || !uri || !kind) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.94)", justifyContent: "center", alignItems: "center" }}>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Cerrar"
          style={{ position: "absolute", top: 48, right: 20, zIndex: 2, padding: 8 }}
        >
          <MaterialIcons name="close" size={28} color="#FFFFFF" />
        </Pressable>
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
