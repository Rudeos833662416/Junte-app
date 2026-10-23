import { Image } from "expo-image";
import type { ImageStyle, StyleProp } from "react-native";

const ORIGINAL_CAN = require("@/assets/images/bebe-conmigo-original.png");

type BebeConmigoCanProps = {
  width?: number;
  height?: number;
  style?: StyleProp<ImageStyle>;
  accessibilityLabel?: string;
};

/** Usa exclusivamente la imagen original adjunta; no la redibuja ni la vectoriza. */
export function BebeConmigoCan({ width = 54, height = 92, style, accessibilityLabel = "Lata BEBE CONMIGO" }: BebeConmigoCanProps) {
  return (
    <Image
      source={ORIGINAL_CAN}
      style={[{ width, height }, style]}
      contentFit="contain"
      cachePolicy="memory-disk"
      accessibilityLabel={accessibilityLabel}
    />
  );
}
