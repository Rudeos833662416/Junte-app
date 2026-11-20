import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRef, type ReactNode } from "react";
import { Animated, PanResponder, Pressable, type GestureResponderEvent, type StyleProp, type ViewStyle } from "react-native";

const REPLY_THRESHOLD = 56;
const MAX_TRANSLATE = 72;

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  color: string;
  iconColor: string;
  onReply: () => void;
  onLongPress?: (event: GestureResponderEvent) => void;
  delayLongPress?: number;
  accessibilityRole?: "button" | "none";
  accessibilityLabel?: string;
};

export function SwipeableMessageBubble({ children, style, color, iconColor, onReply, onLongPress, delayLongPress, accessibilityRole, accessibilityLabel }: Props) {
  const translateX = useRef(new Animated.Value(0)).current;
  const thresholdReached = useRef(false);
  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 5 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderMove: (_event, gesture) => {
        const next = Math.max(0, Math.min(MAX_TRANSLATE, gesture.dx));
        translateX.setValue(next);
        const reached = next >= REPLY_THRESHOLD;
        if (reached && !thresholdReached.current) {
          thresholdReached.current = true;
          void Haptics.selectionAsync();
        } else if (!reached) {
          thresholdReached.current = false;
        }
      },
      onPanResponderRelease: (_event, gesture) => {
        const shouldReply = gesture.dx >= REPLY_THRESHOLD;
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, speed: 22, bounciness: 7 }).start();
        thresholdReached.current = false;
        if (shouldReply) onReply();
      },
      onPanResponderTerminate: () => {
        thresholdReached.current = false;
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, speed: 22, bounciness: 7 }).start();
      },
    }),
  ).current;

  return (
    <Animated.View style={{ transform: [{ translateX }], position: "relative" }} {...responder.panHandlers}>
      <Animated.View pointerEvents="none" style={{ position: "absolute", left: -34, top: "50%", marginTop: -17, width: 34, height: 34, borderRadius: 17, backgroundColor: color, alignItems: "center", justifyContent: "center", opacity: translateX.interpolate({ inputRange: [0, REPLY_THRESHOLD], outputRange: [0.18, 1], extrapolate: "clamp" }), transform: [{ scale: translateX.interpolate({ inputRange: [0, REPLY_THRESHOLD], outputRange: [0.72, 1], extrapolate: "clamp" }) }] }}>
        <MaterialIcons name="reply" size={18} color={iconColor} />
      </Animated.View>
      <Pressable
        onLongPress={onLongPress}
        delayLongPress={delayLongPress}
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel}
        style={style}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
