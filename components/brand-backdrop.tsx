import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { useColors } from "@/hooks/use-colors";

export function BrandBackdrop({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}>
      <View pointerEvents="none" style={[styles.topGlow, { backgroundColor: colors.primary }]} />
      <View pointerEvents="none" style={[styles.sideGlow, { backgroundColor: colors.secondary }]} />
      <View pointerEvents="none" style={[styles.creamWash, { backgroundColor: colors.accent }]} />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1 },
  topGlow: {
    position: "absolute",
    top: -180,
    left: -120,
    width: 520,
    height: 360,
    borderRadius: 240,
    opacity: 0.13,
    transform: [{ rotate: "-12deg" }],
  },
  sideGlow: {
    position: "absolute",
    right: -180,
    top: "36%",
    width: 420,
    height: 520,
    borderRadius: 280,
    opacity: 0.08,
    transform: [{ rotate: "18deg" }],
  },
  creamWash: {
    position: "absolute",
    left: -160,
    bottom: -230,
    width: 520,
    height: 420,
    borderRadius: 280,
    opacity: 0.05,
  },
});
