import { useEffect } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

type Props = {
  uri: string | null;
  onClose: () => void;
  /** When true, try to block screenshots (Android FLAG_SECURE / iOS best-effort). */
  secure?: boolean;
};

/**
 * Fullscreen image viewer. Uses expo-screen-capture when available.
 * Zoom: pinch via maximumZoomScale on iOS ScrollView; Android simple fit.
 */
export function SecureMediaViewer({ uri, onClose, secure = true }: Props) {
  const { width, height } = useWindowDimensions();
  const visible = Boolean(uri);

  useEffect(() => {
    if (!visible || !secure || Platform.OS === "web") return;
    let active = true;
    void (async () => {
      try {
        const ScreenCapture = await import("expo-screen-capture");
        if (active) await ScreenCapture.preventScreenCaptureAsync();
      } catch {
        // dependency optional until installed
      }
    })();
    return () => {
      active = false;
      void (async () => {
        try {
          const ScreenCapture = await import("expo-screen-capture");
          await ScreenCapture.allowScreenCaptureAsync();
        } catch {
          // ignore
        }
      })();
    };
  }, [visible, secure]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <Pressable
          onPress={onClose}
          hitSlop={12}
          style={{
            position: "absolute",
            top: 52,
            right: 20,
            zIndex: 10,
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: "rgba(0,0,0,0.55)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <MaterialIcons name="close" size={22} color="#fff" />
        </Pressable>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            alignItems: "center",
            minHeight: height,
          }}
          maximumZoomScale={4}
          minimumZoomScale={1}
          centerContent
          bouncesZoom
        >
          {uri ? (
            <ExpoImage
              source={{ uri }}
              style={{ width, height: height * 0.85 }}
              contentFit="contain"
            />
          ) : null}
        </ScrollView>

        <Text
          style={{
            position: "absolute",
            bottom: 28,
            alignSelf: "center",
            color: "rgba(255,255,255,0.55)",
            fontSize: 12,
          }}
        >
          Toca × para cerrar
        </Text>
      </View>
    </Modal>
  );
}
