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
  style,
  accessibilityLabel,
}: Props) {
  const gestureConsumedRef = useRef(false);

  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) =>
        recording && !locked && (Math.abs(gesture.dx) > 12 || Math.abs(gesture.dy) > 12),
      onPanResponderRelease: (_event, gesture) => {
        if (!recording || locked) return;
        if (gesture.dx < -60) {
          gestureConsumedRef.current = true;
          onCancel();
        } else if (gesture.dy < -55) {
          gestureConsumedRef.current = true;
          onLock();
        } else {
          gestureConsumedRef.current = true;
          onReleaseSend();
        }
      },
      onPanResponderTerminate: () => {
        if (recording && !locked && !gestureConsumedRef.current) {
          gestureConsumedRef.current = true;
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
        } else if (recording) {
          onReleaseSend();
        }
      }}
      onPressIn={() => {
        if (hasText || recording) return;
        gestureConsumedRef.current = false;
        onStartHold();
      }}
      onPressOut={() => {
        if (hasText || !recording || locked) return;
        if (gestureConsumedRef.current) {
          gestureConsumedRef.current = false;
          return;
        }
        onReleaseSend();
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
