import { useRef, type ReactNode } from "react";
import { PanResponder, Pressable, type PressableStateCallbackType, type StyleProp, type ViewStyle } from "react-native";

type Props = {
  children: ReactNode;
  recording: boolean;
  disabled?: boolean;
  onTap: () => void;
  onCancel: () => void;
  onLock: () => void;
  style?: StyleProp<ViewStyle> | ((state: PressableStateCallbackType) => StyleProp<ViewStyle>);
  accessibilityLabel: string;
};

export function VoiceRecordGestureButton({ children, recording, disabled, onTap, onCancel, onLock, style, accessibilityLabel }: Props) {
  const responder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => recording && (Math.abs(gesture.dx) > 12 || Math.abs(gesture.dy) > 12),
    onPanResponderRelease: (_event, gesture) => {
      if (gesture.dx < -64) onCancel();
      else if (gesture.dy < -64) onLock();
    },
  })).current;

  return (
    <Pressable
      {...responder.panHandlers}
      onPress={onTap}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={style}
    >
      {children}
    </Pressable>
  );
}
