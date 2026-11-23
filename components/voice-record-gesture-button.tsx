import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Pressable, View, type PressableStateCallbackType, type StyleProp, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";

type Props = {
  children: ReactNode;
  recording: boolean;
  locked?: boolean;
  hasText?: boolean;
  disabled?: boolean;
  onPressSendText: () => void;
  onStartHold: () => void;
  onReleaseSend: () => void;
  onCancel: () => void;
  onLock: () => void;
  style?: StyleProp<ViewStyle> | ((state: PressableStateCallbackType) => StyleProp<ViewStyle>);
  accessibilityLabel: string;
};

const CANCEL_THRESHOLD_X = -54;
const LOCK_THRESHOLD_Y = -48;

export function VoiceRecordGestureButton({
  children,
  recording,
  locked = false,
  hasText = false,
  disabled,
  onPressSendText,
  onStartHold,
  onReleaseSend,
  onCancel,
  onLock,
  style,
  accessibilityLabel,
}: Props) {
  const gestureHandledRef = useRef(false);
  const holdingRef = useRef(false);
  const recordingRef = useRef(recording);
  const lockedRef = useRef(locked);
  const hasTextRef = useRef(hasText);

  const callbacksRef = useRef({
    onPressSendText,
    onStartHold,
    onReleaseSend,
    onCancel,
    onLock,
  });

  useEffect(() => {
    callbacksRef.current = {
      onPressSendText,
      onStartHold,
      onReleaseSend,
      onCancel,
      onLock,
    };
  }, [onPressSendText, onStartHold, onReleaseSend, onCancel, onLock]);

  useEffect(() => {
    recordingRef.current = recording;
    if (!recording) {
      holdingRef.current = false;
    }
  }, [recording]);

  useEffect(() => {
    lockedRef.current = locked;
  }, [locked]);

  useEffect(() => {
    hasTextRef.current = hasText;
  }, [hasText]);

  const dragOffset = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const animatedStyle = typeof style === "function" ? style({ pressed: false, hovered: false }) : style;

  const resetDrag = () => {
    Animated.spring(dragOffset, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: true,
      speed: 30,
      bounciness: 3,
    }).start();
  };

  useEffect(() => {
    if (!recording || locked) {
      dragOffset.setValue({ x: 0, y: 0 });
    }
  }, [recording, locked, dragOffset]);

  const handleLongPressBegin = () => {
    if (disabled || hasTextRef.current || lockedRef.current) return;
    if (recordingRef.current || holdingRef.current) return;
    gestureHandledRef.current = false;
    holdingRef.current = true;
    callbacksRef.current.onStartHold();
  };

  const handleLongPressEnd = () => {
    if (hasTextRef.current || lockedRef.current) return;
    if (gestureHandledRef.current) {
      gestureHandledRef.current = false;
      return;
    }
    if (holdingRef.current || recordingRef.current) {
      gestureHandledRef.current = true;
      holdingRef.current = false;
      resetDrag();
      callbacksRef.current.onReleaseSend();
    }
  };

  const handlePanUpdate = (dx: number, dy: number) => {
    if (hasTextRef.current || lockedRef.current || gestureHandledRef.current) return;
    if (!holdingRef.current && !recordingRef.current) return;

    dragOffset.setValue({
      x: Math.max(-68, Math.min(0, dx * 0.65)),
      y: Math.max(-60, Math.min(0, dy * 0.65)),
    });

    if (dx <= CANCEL_THRESHOLD_X) {
      gestureHandledRef.current = true;
      holdingRef.current = false;
      resetDrag();
      callbacksRef.current.onCancel();
    } else if (dy <= LOCK_THRESHOLD_Y) {
      gestureHandledRef.current = true;
      holdingRef.current = false;
      resetDrag();
      callbacksRef.current.onLock();
    }
  };

  const handlePanFinalize = (dx: number, dy: number) => {
    resetDrag();
    if (hasTextRef.current || lockedRef.current) return;
    if (gestureHandledRef.current) {
      gestureHandledRef.current = false;
      return;
    }
    if (holdingRef.current || recordingRef.current) {
      gestureHandledRef.current = true;
      holdingRef.current = false;
      if (dx <= CANCEL_THRESHOLD_X) {
        callbacksRef.current.onCancel();
      } else if (dy <= LOCK_THRESHOLD_Y) {
        callbacksRef.current.onLock();
      } else {
        callbacksRef.current.onReleaseSend();
      }
    }
  };

  const longPressGesture = Gesture.LongPress()
    .minDuration(0)
    .enabled(!disabled && !hasText && !locked)
    .onBegin(() => {
      runOnJS(handleLongPressBegin)();
    })
    .onFinalize(() => {
      runOnJS(handleLongPressEnd)();
    });

  const panGesture = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .activeOffsetY([-12, 12])
    .enabled(!disabled && !hasText && !locked)
    .onUpdate((e) => {
      runOnJS(handlePanUpdate)(e.translationX, e.translationY);
    })
    .onFinalize((e) => {
      runOnJS(handlePanFinalize)(e.translationX, e.translationY);
    });

  const composedGesture = Gesture.Simultaneous(longPressGesture, panGesture);

  if (hasText || locked) {
    return (
      <Pressable
        onPress={() => {
          if (hasTextRef.current) callbacksRef.current.onPressSendText();
          else if (lockedRef.current) callbacksRef.current.onReleaseSend();
        }}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={style}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View
        accessible
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={[
          {
            width: 48,
            height: 48,
            borderRadius: 18,
            alignItems: "center",
            justifyContent: "center",
          },
          animatedStyle,
          {
            opacity: disabled ? 0.55 : 1,
            transform: [{ translateX: dragOffset.x }, { translateY: dragOffset.y }],
          },
        ]}
      >
        <View style={{ alignItems: "center", justifyContent: "center" }} pointerEvents="none">
          {children}
        </View>
      </Animated.View>
    </GestureDetector>
  );
}
