import { useColors } from "@/hooks/use-colors";
import MapView, { Marker } from "react-native-maps";
import { Text, View } from "react-native";
import type { VenueMapPickerProps } from "./venue-map-picker";

export default function VenueMapPicker({ initialCoordinate, selectedCoordinate, onSelect }: VenueMapPickerProps) {
  const colors = useColors();
  const center = selectedCoordinate ?? initialCoordinate;
  if (!center) {
    return (
      <View className="h-56 items-center justify-center rounded-2xl border px-5" style={{ borderColor: colors.border, backgroundColor: colors.surface }}>
        <Text className="text-center text-sm font-semibold text-foreground">Permite la ubicación para abrir el mapa</Text>
        <Text className="mt-2 text-center text-xs leading-5 text-muted">También puedes buscar una dirección y seleccionar un resultado.</Text>
      </View>
    );
  }
  const region = { ...center, latitudeDelta: 0.025, longitudeDelta: 0.025 };

  return (
    <View className="h-56 overflow-hidden rounded-2xl border" style={{ borderColor: colors.border }}>
      <MapView
        style={{ flex: 1 }}
        initialRegion={region}
        onPress={(event) => onSelect(event.nativeEvent.coordinate)}
        showsUserLocation={Boolean(initialCoordinate)}
        loadingEnabled
      >
        {center ? <Marker coordinate={center} title="Lugar seleccionado" pinColor={colors.primary} /> : null}
      </MapView>
      <View className="absolute bottom-2 left-2 right-2 rounded-xl px-3 py-2" style={{ backgroundColor: "rgba(255,255,255,0.92)" }} pointerEvents="none">
        <Text className="text-center text-xs font-semibold" style={{ color: colors.foreground }}>
          Toca el mapa para elegir el punto exacto
        </Text>
      </View>
    </View>
  );
}
