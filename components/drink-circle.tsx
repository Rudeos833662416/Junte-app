import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  Pressable,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

export type DrinkCategoryId = "cerveza" | "cocteles" | "whisky" | "licor" | "vino" | "sin_alcohol";

type DrinkCategory = {
  id: DrinkCategoryId;
  label: string;
  emoji: string;
  variants: string[];
};

export const DRINK_CATEGORIES: DrinkCategory[] = [
  {
    id: "cerveza",
    label: "Cerveza",
    emoji: "🍺",
    variants: ["Lager", "IPA", "Stout", "Pilsner", "Trigo"],
  },
  {
    id: "cocteles",
    label: "Cócteles",
    emoji: "🍸",
    variants: ["Mojito", "Margarita", "Negroni", "Daiquiri", "Old Fashioned"],
  },
  {
    id: "whisky",
    label: "Whisky",
    emoji: "🥃",
    variants: ["Scotch", "Bourbon", "Irish", "Rye", "Japanese"],
  },
  {
    id: "licor",
    label: "Licor",
    emoji: "🍾",
    variants: ["Ron", "Tequila", "Vodka", "Gin", "Aguardiente"],
  },
  {
    id: "vino",
    label: "Vino",
    emoji: "🍷",
    variants: ["Tinto", "Blanco", "Rosado", "Espumoso", "Cava"],
  },
  {
    id: "sin_alcohol",
    label: "Sin alcohol",
    emoji: "🥤",
    variants: ["Mocktail", "Refresco", "Agua", "Jugo", "Café"],
  },
];

type Props = {
  active: boolean;
  disabled?: boolean;
  onToggle: () => void;
  activeColor: string;
  idleColor: string;
  /** Reservado: selección local; el mapa no cambia de marcador por ahora. */
  onSelectionChange?: (categoryId: DrinkCategoryId, variant: string) => void;
};

const SIZE = 196;
const SWIPE_THRESHOLD = 36;

export function DrinkCircle({
  active,
  disabled,
  onToggle,
  activeColor,
  idleColor,
  onSelectionChange,
}: Props) {
  const [categoryIndex, setCategoryIndex] = useState(0);
  const [variantIndex, setVariantIndex] = useState(0);
  const pulse = useRef(new Animated.Value(0)).current;
  const moved = useRef(false);

  const category = DRINK_CATEGORIES[categoryIndex] ?? DRINK_CATEGORIES[0];
  const variant = category.variants[variantIndex] ?? category.variants[0];

  useEffect(() => {
    onSelectionChange?.(category.id, variant);
  }, [category.id, variant, onSelectionChange]);

  useEffect(() => {
    if (!active) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulse]);

  const hapticLight = useCallback(() => {
    if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const changeCategory = useCallback(
    (delta: number) => {
      setCategoryIndex((current) => {
        const next = (current + delta + DRINK_CATEGORIES.length) % DRINK_CATEGORIES.length;
        return next;
      });
      setVariantIndex(0);
      hapticLight();
    },
    [hapticLight],
  );

  const changeVariant = useCallback(
    (delta: number) => {
      setVariantIndex((current) => {
        const list = DRINK_CATEGORIES[categoryIndex]?.variants ?? [""];
        return (current + delta + list.length) % list.length;
      });
      hapticLight();
    },
    [categoryIndex, hapticLight],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: (_, g) =>
          !disabled && (Math.abs(g.dx) > 8 || Math.abs(g.dy) > 8),
        onPanResponderGrant: () => {
          moved.current = false;
        },
        onPanResponderMove: (_, g) => {
          if (Math.abs(g.dx) > 12 || Math.abs(g.dy) > 12) moved.current = true;
        },
        onPanResponderRelease: (_, g) => {
          const absX = Math.abs(g.dx);
          const absY = Math.abs(g.dy);

          if (absX > SWIPE_THRESHOLD && absX > absY) {
            // Horizontal: marca / presentación
            changeVariant(g.dx < 0 ? 1 : -1);
            return;
          }
          if (absY > SWIPE_THRESHOLD && absY > absX) {
            // Vertical: tipo de trago
            changeCategory(g.dy < 0 ? 1 : -1);
            return;
          }

          if (!moved.current && !disabled) {
            onToggle();
          }
        },
      }),
    [changeCategory, changeVariant, disabled, onToggle],
  );

  const haloScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.7] });
  const circleColor = active ? activeColor : idleColor;

  return (
    <View style={{ alignItems: "center", width: SIZE + 24 }}>
      <View style={{ width: SIZE + 24, height: SIZE + 24, alignItems: "center", justifyContent: "center" }}>
        {active ? (
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              width: SIZE + 18,
              height: SIZE + 18,
              borderRadius: (SIZE + 18) / 2,
              backgroundColor: activeColor,
              opacity: haloOpacity,
              transform: [{ scale: haloScale }],
            }}
          />
        ) : null}

        <View
          {...panResponder.panHandlers}
          accessibilityRole="button"
          accessibilityLabel={
            active
              ? `Brindando con ${category.label} ${variant}. Toca para terminar.`
              : `${category.label}, ${variant}. Desliza vertical para tipo, horizontal para marca. Toca para brindar.`
          }
          style={{
            width: SIZE,
            height: SIZE,
            borderRadius: SIZE / 2,
            backgroundColor: circleColor,
            alignItems: "center",
            justifyContent: "center",
            opacity: disabled ? 0.7 : 1,
            borderWidth: active ? 3 : 0,
            borderColor: "rgba(255,255,255,0.35)",
          }}
        >
          <Text style={{ fontSize: 64, lineHeight: 72 }}>{category.emoji}</Text>
          <Text
            numberOfLines={1}
            style={{
              marginTop: 4,
              color: "#fff",
              fontWeight: "800",
              fontSize: 15,
              maxWidth: SIZE - 36,
              textAlign: "center",
            }}
          >
            {variant}
          </Text>
          <Text
            style={{
              marginTop: 2,
              color: "rgba(255,255,255,0.85)",
              fontSize: 11,
              fontWeight: "600",
            }}
          >
            {category.label}
          </Text>
        </View>
      </View>

      <Text
        style={{
          marginTop: 14,
          fontSize: 17,
          fontWeight: "700",
          color: active ? activeColor : "#E8E8E8",
        }}
      >
        {active ? "¡Brindando!" : "Toca para brindar"}
      </Text>

      {!active ? (
        <Text
          style={{
            marginTop: 6,
            fontSize: 11,
            color: "rgba(255,255,255,0.45)",
            textAlign: "center",
            maxWidth: 220,
          }}
        >
          ↑↓ tipo de trago · ←→ marca
        </Text>
      ) : (
        <Pressable onPress={onToggle} disabled={disabled} hitSlop={8} style={{ marginTop: 4 }}>
          <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Toca de nuevo para terminar</Text>
        </Pressable>
      )}
    </View>
  );
}
