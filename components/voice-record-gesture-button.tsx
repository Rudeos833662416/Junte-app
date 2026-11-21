import { useEffect, useRef, type ReactNode } from "react";
import {
  Animated,
  PanResponder,
  Pressable,
  View,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from "react-native";

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
  const gestureConsumedRef = useRef(false);
  const holdStartedRef = useRef(false);
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
      holdStartedRef.current = false;
    }
  }, [recording]);

  useEffect(() => {
    lockedRef.current = locked;
  }, [locked]);

  useEffect(() => {
    hasTextRef.current = hasText;
  }, [hasText]);

  const dragOffset = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  const resetDrag = () => {
    Animated.spring(dragOffset, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: true,
      speed: 28,
      bounciness: 4,
    }).start();
  };

  useEffect(() => {
    if (!recording || locked) {
      dragOffset.setValue({ x: 0, y: 0 });
    }
  }, [recording, locked, dragOffset]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_event, gesture) => {
        if (hasTextRef.current || lockedRef.current) return false;
        if (!recordingRef.current && !holdStartedRef.current) return false;
        return Math.abs(gesture.dx) > 10 || Math.abs(gesture.dy) > 10;
      },
      onPanResponderGrant: () => {
        gestureConsumedRef.current = false;
      },
      onPanResponderMove: (_event, gesture) => {
        if (hasTextRef.current || lockedRef.current || gestureConsumedRef.current) return;
        if (!recordingRef.current && !holdStartedRef.current) return;

        const clampedX = Math.max(-68, Math.min(0, gesture.dx * 0.65));
        const clampedY = Math.max(-60, Math.min(0, gesture.dy * 0.65));
        dragOffset.setValue({ x: clampedX, y: clampedY });

        if (gesture.dx <= CANCEL_THRESHOLD_X) {
          gestureConsumedRef.current = true;
          holdStartedRef.current = false;
          resetDrag();
          callbacksRef.current.onCancel();
        } else if (gesture.dy <= LOCK_THRESHOLD_Y) {
          gestureConsumedRef.current = true;
          holdStartedRef.current = false;
          resetDrag();
          callbacksRef.current.onLock();
        }
      },
      onPanResponderRelease: (_event, gesture) => {
        resetDrag();
        if (hasTextRef.current || lockedRef.current) return;
        if (gestureConsumedRef.current) {
          gestureConsumedRef.current = false;
          return;
        }
        if (recordingRef.current || holdStartedRef.current) {
          holdStartedRef.current = false;
          if (gesture.dx <= CANCEL_THRESHOLD_X) {
            callbacksRef.current.onCancel();
          } else if (gesture.dy <= LOCK_THRESHOLD_Y) {
            callbacksRef.current.onLock();
          } else {
            callbacksRef.current.onReleaseSend();
          }
        }
      },
      onPanResponderTerminate: () => {
        resetDrag();
        if (hasTextRef.current || lockedRef.current) return;
        if (gestureConsumedRef.current) {
          gestureConsumedRef.current = false;
          return;
        }
        if (recordingRef.current || holdStartedRef.current) {
          holdStartedRef.current = false;
          callbacksRef.current.onReleaseSend();
        }
      },
    }),
  ).current;

  const animatedStyle = {
    transform: [
      { translateX: dragOffset.x },
      { translateY: dragOffset.y },
    ],
  };

  return (
    <View {...panResponder.panHandlers}>
      <Animated.View style={animatedStyle}>
        <Pressable
          onPress={() => {
            if (hasTextRef.current) {
              callbacksRef.current.onPressSendText();
            } else if (lockedRef.current) {
              callbacksRef.current.onReleaseSend();
            }
          }}
          onPressIn={() => {
            if (hasTextRef.current || lockedRef.current || recordingRef.current) return;
            gestureConsumedRef.current = false;
            holdStartedRef.current = true;
            callbacksRef.current.onStartHold();
          }}
          onPressOut={() => {
            if (hasTextRef.current || lockedRef.current) return;
            if (gestureConsumedRef.current) {
              gestureConsumedRef.current = false;
              return;
            }
            if (holdStartedRef.current || recordingRef.current) {
              holdStartedRef.current = false;
              gestureConsumedRef.current = true;
              resetDrag();
              callbacksRef.current.onReleaseSend();
            }
          }}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          style={style}
        >
          {children}
        </Pressable>
      </Animated.View>
    </View>
  );
}
