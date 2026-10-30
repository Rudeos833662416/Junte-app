import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from "react-native";
import Constants from "expo-constants";
import { useColors } from "@/hooks/use-colors";

type PlacePrediction = {
  place_id: string;
  description: string;
};

export type PlaceResult = {
  address: string;
  latitude: number;
  longitude: number;
  city?: string | null;
};

function googleKey() {
  const extra = (Constants.expoConfig?.extra ?? {}) as { googleMapsApiKey?: string };
  return (
    extra.googleMapsApiKey ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.Places ||
    process.env.GOOGLE_PLACES_API_KEY ||
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    ""
  ).trim();
}

/**
 * Autocompletado con Google Places + texto libre.
 * El usuario siempre puede escribir la dirección a mano.
 */
export function AddressAutocomplete({
  value,
  onChangeText,
  onPlaceSelected,
  placeholder = "Escribe o busca dirección…",
}: {
  value: string;
  onChangeText: (text: string) => void;
  onPlaceSelected: (place: PlaceResult) => void;
  placeholder?: string;
}) {
  const colors = useColors();
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = googleKey();

  const search = useCallback(
    (text: string) => {
      onChangeText(text);
      if (timer.current) clearTimeout(timer.current);
      if (!key) {
        setPredictions([]);
        setHint("Sin GOOGLE_MAPS_API_KEY: escribe la dirección a mano.");
        return;
      }
      if (text.trim().length < 3) {
        setPredictions([]);
        setHint(null);
        return;
      }
      timer.current = setTimeout(async () => {
        setLoading(true);
        setHint(null);
        try {
          const url =
            "https://maps.googleapis.com/maps/api/place/autocomplete/json" +
            `?input=${encodeURIComponent(text)}` +
            "&language=es&types=establishment|geocode" +
            `&key=${encodeURIComponent(key)}`;
          const res = await fetch(url);
          const json = (await res.json()) as {
            status: string;
            predictions?: PlacePrediction[];
            error_message?: string;
          };
          if (json.status !== "OK" && json.status !== "ZERO_RESULTS") {
            setHint(json.error_message || `Places: ${json.status}`);
            setPredictions([]);
            return;
          }
          setPredictions(json.predictions ?? []);
        } catch (err) {
          setHint(err instanceof Error ? err.message : "Error de red");
          setPredictions([]);
        } finally {
          setLoading(false);
        }
      }, 350);
    },
    [key, onChangeText],
  );

  const pick = async (prediction: PlacePrediction) => {
    if (!key) return;
    setLoading(true);
    try {
      const url =
        "https://maps.googleapis.com/maps/api/place/details/json" +
        `?place_id=${encodeURIComponent(prediction.place_id)}` +
        "&fields=formatted_address,geometry,address_components" +
        `&key=${encodeURIComponent(key)}`;
      const res = await fetch(url);
      const json = (await res.json()) as {
        status: string;
        result?: {
          formatted_address?: string;
          geometry?: { location?: { lat: number; lng: number } };
          address_components?: { long_name: string; types: string[] }[];
        };
        error_message?: string;
      };
      if (json.status !== "OK" || !json.result?.geometry?.location) {
        setHint(json.error_message || "No se pudo obtener la ubicación");
        return;
      }
      const cityComp = json.result.address_components?.find(
        (c) => c.types.includes("locality") || c.types.includes("administrative_area_level_2"),
      );
      const address = json.result.formatted_address || prediction.description;
      onChangeText(address);
      onPlaceSelected({
        address,
        latitude: json.result.geometry.location.lat,
        longitude: json.result.geometry.location.lng,
        city: cityComp?.long_name ?? null,
      });
      setPredictions([]);
    } catch (err) {
      setHint(err instanceof Error ? err.message : "Error al resolver dirección");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <TextInput
          value={value}
          onChangeText={search}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 10,
            color: colors.foreground,
          }}
        />
        {loading ? <ActivityIndicator color={colors.primary} /> : null}
      </View>
      <Text style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>
        Puedes escribir la dirección a mano; si eliges una sugerencia se rellenan las coordenadas.
      </Text>
      {hint ? <Text style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>{hint}</Text> : null}
      {predictions.length > 0 ? (
        <View
          style={{
            marginTop: 6,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            backgroundColor: colors.surface,
            maxHeight: 180,
            overflow: "hidden",
          }}
        >
          <FlatList
            keyboardShouldPersistTaps="handled"
            data={predictions}
            keyExtractor={(item) => item.place_id}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => void pick(item)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                }}
              >
                <Text style={{ color: colors.foreground, fontSize: 13 }}>{item.description}</Text>
              </Pressable>
            )}
          />
        </View>
      ) : null}
    </View>
  );
}
