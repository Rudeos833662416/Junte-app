import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { Text, View } from "react-native";

export default function NativeMapFallback() {
  const colors = useColors();

  return (
    <ScreenContainer className="p-5">
      <View className="flex-1">
        <View className="mb-4">
          <Text className="text-3xl font-bold text-foreground">Mapa</Text>
          <Text className="text-sm text-muted">time to drink · ubicación real en tu dispositivo</Text>
        </View>
        <View
          className="flex-1 items-center justify-center rounded-2xl border bg-surface px-6"
          style={{ borderColor: colors.border }}
        >
          <IconSymbol name="map.fill" size={56} color={colors.primary} />
          <Text className="mt-4 text-center text-lg font-semibold text-foreground">
            Mapa nativo de Tragos Sociales
          </Text>
          <Text className="mt-2 text-center text-sm leading-5 text-muted">
            Abre Tragos Sociales en Expo Go o en una build Android/iOS para conceder el permiso de ubicación y ver tu posición real.
          </Text>
        </View>
      </View>
    </ScreenContainer>
  );
}
