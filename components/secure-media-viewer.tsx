import { useEffect, useRef } from "react";
import {
  Animated,
  Modal,
  PanResponder,
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
 * Visor fullscreen. Cierre: atrás del sistema o swipe hacia abajo.
 * Sin botones X ni textos orientativos. Protección de capturas opcional.
 */
export function SecureMediaViewer({ uri, onClose, secure = true }: Props) {
  const { width, height } = useWindowDimensions();
  const visible = Boolean(uri);
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      translateY.setValue(0);
      return;
    }
    if (!secure || Platform.OS === "web") return;
    let active = true;
    void (async () => {
      try {
        const ScreenCapture = await import("expo-screen-capture");
        if (active) await ScreenCapture.preventScreenCaptureAsync();
      } catch {
        // optional until native module is present
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
  }, [visible, secure, translateY]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gesture) =>
        Math.abs(gesture.dy) > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_evt, gesture) => {
        if (gesture.dy > 0) translateY.setValue(gesture.dy);
      },
      onPanResponderRelease: (_evt, gesture) => {
        if (gesture.dy > 120 || gesture.vy > 1.1) {
          Animated.timing(translateY, {
            toValue: height,
            duration: 180,
            useNativeDriver: true,
          }).start(() => {
            translateY.setValue(0);
            onClose();
          });
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 6,
          }).start();
        }
      },
    }),
  ).current;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Animated.View
        style={{
          flex: 1,
          backgroundColor: "#000",
          transform: [{ translateY }],
        }}
        {...panResponder.panHandlers}
      >
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
          scrollEnabled={false}
        >
          {uri ? (
            <ExpoImage
              source={{ uri }}
              style={{ width, height: height * 0.85 }}
              contentFit="contain"
            />
          ) : null}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}
