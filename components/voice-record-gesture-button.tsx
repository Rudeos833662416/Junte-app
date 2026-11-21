import { useRef, type ReactNode } from "react";
import { PanResponder, Pressable, type PressableStateCallbackType, type StyleProp, type ViewStyle } from "react-native";

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
  onDragOffset?: (dx: number, dy: number) => void;
  style?: StyleProp<ViewStyle> | ((state: PressableStateCallbackType) => StyleProp<ViewStyle>);
  accessibilityLabel: string;
};

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
  onDragOffset,
  style,
  accessibilityLabel,
}: Props) {
  const gestureConsumedRef = useRef(false);
  const activeHoldRef = useRef(false);

  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) =>
        (recording || activeHoldRef.current) && !locked && (Math.abs(gesture.dx) > 8 || Math.abs(gesture.dy) > 8),
      onPanResponderMove: (_event, gesture) => {
        if ((!recording && !activeHoldRef.current) || locked || gestureConsumedRef.current) return;
        onDragOffset?.(gesture.dx, gesture.dy);
        if (gesture.dx < -54) {
          gestureConsumedRef.current = true;
          activeHoldRef.current = false;
          onDragOffset?.(0, 0);
          onCancel();
        } else if (gesture.dy < -48) {
          gestureConsumedRef.current = true;
          activeHoldRef.current = false;
          onDragOffset?.(0, 0);
          onLock();
        }
      },
      onPanResponderRelease: (_event, gesture) => {
        onDragOffset?.(0, 0);
        if ((!recording && !activeHoldRef.current) || locked || gestureConsumedRef.current) {
          gestureConsumedRef.current = false;
          activeHoldRef.current = false;
          return;
        }
        gestureConsumedRef.current = true;
        activeHoldRef.current = false;
        if (gesture.dx < -54) {
          onCancel();
        } else if (gesture.dy < -48) {
          onLock();
        } else {
          onReleaseSend();
        }
      },
      onPanResponderTerminate: () => {
        onDragOffset?.(0, 0);
        if ((recording || activeHoldRef.current) && !locked && !gestureConsumedRef.current) {
          gestureConsumedRef.current = true;
          activeHoldRef.current = false;
          onReleaseSend();
        }
      },
    }),
  ).current;

  return (
    <Pressable
      {...responder.panHandlers}
      onPress={() => {
        if (hasText) {
          onPressSendText();
        } else if (locked) {
          // Solo cuando está en modo manos libres bloqueado se envía al tocar el botón Send
          onReleaseSend();
        }
      }}
      onPressIn={() => {
        if (hasText || recording || locked) return;
        gestureConsumedRef.current = false;
        activeHoldRef.current = true;
        onStartHold();
      }}
      onPressOut={() => {
        onDragOffset?.(0, 0);
        if (hasText || locked) {
          activeHoldRef.current = false;
          return;
        }
        if (gestureConsumedRef.current) {
          gestureConsumedRef.current = false;
          activeHoldRef.current = false;
          return;
        }
        if (recording || activeHoldRef.current) {
          gestureConsumedRef.current = true;
          activeHoldRef.current = false;
          onReleaseSend();
        }
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
