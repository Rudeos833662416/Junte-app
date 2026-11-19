import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Returns the bottom inset needed to keep fixed footers above the software keyboard.
 * Combines keyboard height with safe-area bottom so content never sits under the keyboard.
 */
export function useKeyboardInset() {
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const onShow = (event: { endCoordinates?: { height?: number } }) => {
      setKeyboardHeight(Math.max(0, event.endCoordinates?.height ?? 0));
    };
    const onHide = () => setKeyboardHeight(0);

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const bottomInset = keyboardHeight > 0 ? keyboardHeight : insets.bottom;
  return {
    keyboardHeight,
    bottomInset,
    isKeyboardVisible: keyboardHeight > 0,
    safeBottom: insets.bottom,
  };
}
