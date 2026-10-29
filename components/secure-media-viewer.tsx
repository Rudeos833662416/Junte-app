import { useEffect } from "react";
import {
  Modal,
  Platform,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import { Image as ExpoImage } from "expo-image";

type Props = {
  uri: string | null;
  onClose: () => void;
  /** When true, try to block screenshots (Android FLAG_SECURE / iOS best-effort). */
  secure?: boolean;
};

/**
 * Fullscreen image viewer. Cierre: gesto atrás del sistema (onRequestClose).
 * Zoom: pinch vía maximumZoomScale en iOS ScrollView.
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
      </View>
    </Modal>
  );
}
