import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Animated, Modal, PanResponder, Platform, Pressable, Share, Text, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { MaterialIcons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { shouldDismissSwipe } from "@/lib/interaction-gestures";
import { JuntaVideoPlayer } from "@/components/junta-video-player";

type Props = {
  visible: boolean;
  uri: string | null;
  kind: "image" | "video" | null;
  onClose: () => void;
  trimStartMs?: number | null;
  trimEndMs?: number | null;
  muted?: boolean;
  overlayText?: string | null;
};

function ViewerVideo({ uri, trimStartMs, trimEndMs, muted }: Pick<Props, "uri" | "trimStartMs" | "trimEndMs" | "muted"> & { uri: string }) {
  const [speed, setSpeed] = useState<1 | 1.5 | 2>(1);
  const startSeconds = Math.max(0, (trimStartMs ?? 0) / 1000);
  const endSeconds = trimEndMs != null ? Math.max(startSeconds + 0.1, trimEndMs / 1000) : null;
  const nextSpeed: 1 | 1.5 | 2 = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;

  return (
    <View style={{ flex: 1, width: "100%", height: "100%", backgroundColor: "#000000" }}>
      <JuntaVideoPlayer
        uri={uri}
        variant="viewer"
        loop={true}
        muted={muted ? true : undefined}
        trimStartSec={startSeconds}
        trimEndSec={endSeconds}
        playbackRate={speed}
        showSpeedButton={true}
        onCycleSpeed={() => setSpeed(nextSpeed)}
        style={{ flex: 1, width: "100%", height: "100%", backgroundColor: "#000000" }}
      />
    </View>
  );
}

export function ChatMediaViewer({ visible, uri, kind, onClose, trimStartMs, trimEndMs, muted, overlayText }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [saving, setSaving] = useState(false);
  const translateY = useState(() => new Animated.Value(0))[0];

  useEffect(() => {
    if (visible) translateY.setValue(0);
  }, [translateY, uri, visible]);

  const dismissPanResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 14 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderMove: (_, gesture) => translateY.setValue(Math.max(0, gesture.dy)),
    onPanResponderRelease: (_, gesture) => {
      if (shouldDismissSwipe(Math.max(0, gesture.dy), gesture.vy)) {
        Animated.timing(translateY, { toValue: height, duration: 180, useNativeDriver: true }).start(onClose);
      } else {
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 5 }).start();
      }
    },
    onPanResponderTerminate: () => Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start(),
  });

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
    <Modal visible={visible} transparent={false} statusBarTranslucent animationType="fade" onRequestClose={onClose}>
      <Animated.View
        {...dismissPanResponder.panHandlers}
        style={{
          flex: 1,
          backgroundColor: "#000000",
          paddingTop: insets.top,
          paddingBottom: Math.max(insets.bottom, 10),
          justifyContent: "center",
          alignItems: "center",
          transform: [{ translateY }],
          opacity: translateY.interpolate({ inputRange: [0, height], outputRange: [1, 0.35] }),
        }}
      >
        <View style={{ position: "absolute", top: insets.top + 10, right: 14, zIndex: 20, flexDirection: "row", gap: 10 }}>
          <Pressable
            onPress={() => void saveToDevice()}
            accessibilityRole="button"
            accessibilityLabel="Guardar o compartir"
            style={{ width: 42, height: 42, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.65)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", borderRadius: 21 }}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color="#FFF" /> : <MaterialIcons name="download" size={24} color="#FFFFFF" />}
          </Pressable>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
            style={{ width: 42, height: 42, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.65)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", borderRadius: 21 }}
          >
            <MaterialIcons name="close" size={24} color="#FFFFFF" />
          </Pressable>
        </View>

        {kind === "image" ? (
          <Image
            source={{ uri }}
            style={{ width, height: "100%" }}
            contentFit="contain"
            cachePolicy="disk"
          />
        ) : (
          <View style={{ flex: 1, width: "100%", height: "100%" }}>
            <ViewerVideo uri={uri} trimStartMs={trimStartMs} trimEndMs={trimEndMs} muted={muted} />
            {overlayText ? (
              <Text pointerEvents="none" style={{ position: "absolute", left: 24, right: 24, top: "42%", color: "#FFF", fontSize: 24, fontWeight: "800", textAlign: "center", textShadowColor: "#000", textShadowRadius: 6 }}>
                {overlayText}
              </Text>
            ) : null}
          </View>
        )}
      </Animated.View>
    </Modal>
  );
}
