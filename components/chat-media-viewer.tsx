import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Animated, Modal, PanResponder, Platform, Pressable, Share, Text, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { MaterialIcons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import { shouldDismissSwipe } from "@/lib/interaction-gestures";

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
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.muted = Boolean(muted);
    p.play();
  });
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState<1 | 1.5 | 2>(1);
  const startSeconds = Math.max(0, (trimStartMs ?? 0) / 1000);
  const endSeconds = trimEndMs != null ? Math.max(startSeconds + 0.1, trimEndMs / 1000) : null;
  useEffect(() => {
    player.playbackRate = speed;
  }, [player, speed]);
  useEffect(() => {
    player.muted = Boolean(muted);
  }, [muted, player]);
  useEffect(() => {
    try { player.currentTime = startSeconds; } catch { /* player not ready */ }
  }, [player, startSeconds]);
  useEffect(() => {
    const timer = setInterval(() => {
      const duration = Number(player.duration);
      const current = Number(player.currentTime);
      if (duration > 0 && Number.isFinite(current)) setProgress(Math.max(0, Math.min(1, current / duration)));
      if (endSeconds != null && current >= endSeconds) {
        try { player.currentTime = startSeconds; player.play(); } catch { /* released */ }
      }
    }, 200);
    return () => clearInterval(timer);
  }, [endSeconds, player, startSeconds]);
  const nextSpeed = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
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
    <View style={{ width: "100%", height: "70%", justifyContent: "center" }}>
      <VideoView player={player} style={{ width: "100%", height: "100%" }} contentFit="contain" nativeControls={false} />
      <View style={{ position: "absolute", left: 18, right: 18, bottom: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable
          onPress={(event) => {
            const duration = Number(player.duration);
            if (duration > 0) player.currentTime = Math.max(0, Math.min(duration, (event.nativeEvent.locationX / 260) * duration));
          }}
          style={{ flex: 1, height: 28, justifyContent: "center" }}
          accessibilityLabel="Buscar en el vídeo"
        >
          <View style={{ height: 4, borderRadius: 2, backgroundColor: "#FFFFFF66" }}>
            <View style={{ width: `${progress * 100}%`, height: 4, borderRadius: 2, backgroundColor: "#FF6A00" }} />
          </View>
        </Pressable>
        <Pressable onPress={() => setSpeed(nextSpeed)} accessibilityLabel={`Velocidad ${speed}x`} style={{ minWidth: 48, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 14, backgroundColor: "#000A" }}>
          <Text style={{ color: "#FFF", fontSize: 12, fontWeight: "800" }}>{speed}x</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function ChatMediaViewer({ visible, uri, kind, onClose, trimStartMs, trimEndMs, muted, overlayText }: Props) {
  const { width, height } = useWindowDimensions();
  const [saving, setSaving] = useState(false);
  const translateY = useState(() => new Animated.Value(0))[0];

  useEffect(() => {
    if (visible) translateY.setValue(0);
  }, [translateY, uri, visible]);

  const dismissPanResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 12 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Animated.View
        {...dismissPanResponder.panHandlers}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.94)", justifyContent: "center", alignItems: "center", transform: [{ translateY }], opacity: translateY.interpolate({ inputRange: [0, height], outputRange: [1, 0.35] }) }}
      >
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
        <View style={{ width: "100%", height: "70%" }}>
          <ViewerVideo uri={uri} trimStartMs={trimStartMs} trimEndMs={trimEndMs} muted={muted} />
          {overlayText ? <Text style={{ position: "absolute", left: 24, right: 24, top: "42%", color: "#FFF", fontSize: 24, fontWeight: "800", textAlign: "center", textShadowColor: "#000", textShadowRadius: 6 }}>{overlayText}</Text> : null}
        </View>
      )}
      </Animated.View>
    </Modal>
  );
}
