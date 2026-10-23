import { useColors } from "@/hooks/use-colors";
import { Text, View } from "react-native";

export type VenueCoordinate = { latitude: number; longitude: number };

export type VenueMapPickerProps = {
  initialCoordinate: VenueCoordinate | null;
  selectedCoordinate: VenueCoordinate | null;
  onSelect: (coordinate: VenueCoordinate) => void;
};

export default function VenueMapPicker({ initialCoordinate }: VenueMapPickerProps) {
  const colors = useColors();
  return (
    <View className="h-56 items-center justify-center rounded-2xl border px-5" style={{ borderColor: colors.border, backgroundColor: colors.surface }}>
      <Text className="text-center text-sm font-semibold text-foreground">El selector exacto está disponible en el APK</Text>
      <Text className="mt-2 text-center text-xs leading-5 text-muted">
        {initialCoordinate ? "Abre Tragos Sociales en Android o iOS para tocar el punto exacto en el mapa." : "Permite la ubicación para centrar el mapa."}
      </Text>
    </View>
  );
}
