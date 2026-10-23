import { ScreenContainer } from "@/components/screen-container";
import { BebeConmigoCan } from "@/components/bebe-conmigo-can";
import VenueMapPicker, { type VenueCoordinate } from "@/components/venue-map-picker";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { useAppRefresh } from "@/lib/app-refresh";
import { searchNearbyDrinkingPlaces, searchPlacesByAddress, reverseGeocode, type PlaceSearchResult } from "@/lib/openstreetmap";
import { supabase } from "@/lib/supabase";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import Constants from "expo-constants";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image as RNImage, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";

type Venue = {
  id: number;
  name: string;
  address: string | null;
  city: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  source?: string | null;
  source_id?: string | null;
};

type Coordinates = { latitude: number; longitude: number };

type ActiveCheckin = {
  id: number;
  venueId: number;
  venueName: string;
  createdAt: string;
};

const VENUE_FIELDS = "id, name, address, city, country, latitude, longitude, source, source_id";
const LEGACY_VENUE_FIELDS = "id, name, address, city, latitude, longitude";

export default function HomeScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user } = useAuth({ autoFetch: true });
  const { revision } = useAppRefresh();

  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<number | null>(null);
  const [activeCheckin, setActiveCheckin] = useState<ActiveCheckin | null>(null);
  const [isLoadingVenues, setIsLoadingVenues] = useState(true);
  const hasLoadedHomeOnce = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showVenuePicker, setShowVenuePicker] = useState(false);
  const [showCreateVenue, setShowCreateVenue] = useState(false);
  const [venueName, setVenueName] = useState("");
  const [venueAddress, setVenueAddress] = useState("");
  const [venueCity, setVenueCity] = useState("");
  const [venueCountry, setVenueCountry] = useState("Venezuela");
  const [venueQuery, setVenueQuery] = useState("");
  const [deviceCoordinate, setDeviceCoordinate] = useState<Coordinates | null>(null);
  const [selectedCoordinate, setSelectedCoordinate] = useState<Coordinates | null>(null);
  const [searchResults, setSearchResults] = useState<PlaceSearchResult[]>([]);
  const [nearbyPlaces, setNearbyPlaces] = useState<PlaceSearchResult[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<PlaceSearchResult | null>(null);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) {
      setVenues([]);
      setActiveCheckin(null);
      setIsLoadingVenues(false);
      return;
    }

    try {
      if (!hasLoadedHomeOnce.current) setIsLoadingVenues(true);
      let venuesData: Venue[] | null = null;
      const extended = await supabase.from("venues").select(VENUE_FIELDS).order("name", { ascending: true }).limit(100);
      if (!extended.error) {
        venuesData = (extended.data ?? []) as Venue[];
      } else {
        const legacy = await supabase.from("venues").select(LEGACY_VENUE_FIELDS).order("name", { ascending: true }).limit(100);
        if (legacy.error) throw legacy.error;
        venuesData = (legacy.data ?? []) as Venue[];
      }
      setVenues(venuesData);

      const { data: checkinData, error: checkinError } = await supabase
        .from("checkins")
        .select("id, venue_id, created_at, venues(name)")
        .eq("user_id", user.id)
        .eq("status", "active")
        .eq("is_active", true)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (checkinError && checkinError.code !== "PGRST116") throw checkinError;
      if (checkinData) {
        const venueInfo = checkinData.venues as unknown as { name?: string } | null;
        setActiveCheckin({
          id: checkinData.id,
          venueId: checkinData.venue_id,
          venueName: venueInfo?.name ?? "Ubicación GPS actual",
          createdAt: checkinData.created_at,
        });
      } else {
        setActiveCheckin(null);
      }
    } catch (err) {
      console.error("Error loading home data:", err);
    } finally {
      hasLoadedHomeOnce.current = true;
      setIsLoadingVenues(false);
    }
  }, [user]);

  useEffect(() => {
    void fetchData();
    if (!user) return;
    const channel = supabase
      .channel(`tragos-sociales-home-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "checkins", filter: `user_id=eq.${user.id}` }, () => void fetchData())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchData, revision, user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void supabase
      .from("stories")
      .select("media_url")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data }) => {
        if (cancelled) return;
        const urls = [...new Set((data ?? []).map((row) => row.media_url).filter((url): url is string => Boolean(url)))];
        void Promise.all(urls.map((url) => RNImage.prefetch(url).catch(() => false)));
      });
    return () => { cancelled = true; };
  }, [revision, user]);

  const selectedVenue = useMemo(() => venues.find((venue) => venue.id === selectedVenueId) ?? null, [venues, selectedVenueId]);
  const mergedPlaces = useMemo(() => {
    const unique = new Map<string, PlaceSearchResult>();
    [...nearbyPlaces, ...searchResults].forEach((place) => unique.set(place.id, place));
    return Array.from(unique.values());
  }, [nearbyPlaces, searchResults]);

  const resetVenueDraft = () => {
    setVenueName("");
    setVenueAddress("");
    setVenueCity("");
    setVenueCountry("Venezuela");
    setVenueQuery("");
    setSelectedCoordinate(null);
    setSelectedPlace(null);
    setSearchResults([]);
  };

  const loadNearbyPlaces = async () => {
    if (Platform.OS === "web") {
      Alert.alert("Disponible en el APK", "La búsqueda por ubicación se activa en Android y iOS.");
      return;
    }
    try {
      setIsSearchingPlaces(true);
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        Alert.alert("Ubicación necesaria", "Permite la ubicación mientras usas Tragos Sociales para encontrar lugares cercanos.");
        return;
      }
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coordinate = { latitude: current.coords.latitude, longitude: current.coords.longitude };
      setDeviceCoordinate(coordinate);
      setSelectedCoordinate(coordinate);
      const places = await searchNearbyDrinkingPlaces(coordinate.latitude, coordinate.longitude);
      setNearbyPlaces(places);
    } catch (error) {
      Alert.alert("No se pudieron cargar lugares", error instanceof Error ? error.message : "Inténtalo de nuevo.");
    } finally {
      setIsSearchingPlaces(false);
    }
  };

  const handleSearchPlaces = async () => {
    const query = venueQuery.trim();
    if (query.length < 3) {
      Alert.alert("Escribe una búsqueda", "Indica una dirección, ciudad o nombre de bar en Venezuela.");
      return;
    }
    try {
      setIsSearchingPlaces(true);
      setSearchResults(await searchPlacesByAddress(query, "ve"));
    } catch (error) {
      Alert.alert("No se pudo buscar", error instanceof Error ? error.message : "Inténtalo de nuevo.");
    } finally {
      setIsSearchingPlaces(false);
    }
  };

  const handleSelectPlace = (place: PlaceSearchResult) => {
    setSelectedPlace(place);
    setVenueName(place.name);
    setVenueAddress(place.address);
    setVenueCity(place.city ?? "");
    setVenueCountry(place.country ?? "Venezuela");
    setSelectedCoordinate({ latitude: place.latitude, longitude: place.longitude });
  };

  const handleMapCoordinate = async (coordinate: VenueCoordinate) => {
    setSelectedPlace(null);
    setSelectedCoordinate(coordinate);
    try {
      setVenueAddress(await reverseGeocode(coordinate.latitude, coordinate.longitude));
    } catch {
      setVenueAddress("Punto seleccionado en el mapa");
    }
    if (!venueName.trim()) setVenueName("Lugar seleccionado");
  };

  const handleOpenVenuePicker = () => {
    const next = !showVenuePicker;
    setShowVenuePicker(next);
    if (next) void loadNearbyPlaces();
  };

  const handleCreateVenue = async () => {
    const trimmed = venueName.trim();
    if (!trimmed) {
      Alert.alert("Falta el nombre", "Escribe el nombre del bar o selecciona un resultado.");
      return;
    }
    if (!selectedCoordinate) {
      Alert.alert("Selecciona el punto exacto", "Busca la dirección o toca el mapa para indicar dónde está el lugar.");
      return;
    }

    try {
      setIsSubmitting(true);
      let existing: Venue | null = null;
      if (selectedPlace) {
        const lookup = await supabase
          .from("venues")
          .select("id, name, address, city, latitude, longitude")
          .eq("source", selectedPlace.source)
          .eq("source_id", selectedPlace.id)
          .maybeSingle();
        existing = (lookup.data as Venue | null) ?? null;
      }

      let data: Venue | null = existing;
      if (!data) {
        const payload = {
          name: trimmed,
          address: venueAddress.trim() || null,
          city: venueCity.trim() || null,
          country: venueCountry.trim() || "Venezuela",
          latitude: selectedCoordinate.latitude,
          longitude: selectedCoordinate.longitude,
          source: selectedPlace?.source ?? "user",
          source_id: selectedPlace?.id ?? null,
        };
        let created = await supabase.from("venues").insert(payload).select(VENUE_FIELDS).single();
        if (created.error && /column|schema cache/i.test(created.error.message)) {
          created = await supabase.from("venues").insert({
            name: payload.name,
            address: payload.address,
            city: payload.city,
            latitude: payload.latitude,
            longitude: payload.longitude,
          }).select(LEGACY_VENUE_FIELDS).single();
        }
        if (created.error) throw created.error;
        data = created.data as Venue;
      }

      setVenues((previous) => [data as Venue, ...previous.filter((venue) => venue.id !== data?.id)]);
      setSelectedVenueId((data as Venue).id);
      setShowCreateVenue(false);
      resetVenueDraft();
      Alert.alert("Lugar guardado", "Ya puedes brindar en el lugar exacto seleccionado.");
    } catch (err) {
      Alert.alert("No se pudo guardar", err instanceof Error ? err.message : "Revisa la conexión con Supabase.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resolveCurrentCoordinates = async (): Promise<Coordinates> => {
    if (Platform.OS === "web") throw new Error("Brindar automáticamente está disponible en el APK móvil.");
    const permission = await Location.getForegroundPermissionsAsync();
    const permissionResult = permission.status === Location.PermissionStatus.GRANTED
      ? permission
      : await Location.requestForegroundPermissionsAsync();
    if (permissionResult.status !== Location.PermissionStatus.GRANTED) {
      throw new Error("Permite la ubicación para brindar en el punto donde estás.");
    }
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude, accuracy } = current.coords;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        throw new Error("El GPS devolvió una ubicación inválida. Inténtalo de nuevo.");
      }
      if (accuracy != null && accuracy > 1000) {
        throw new Error("La precisión del GPS es insuficiente. Activa la ubicación precisa e inténtalo de nuevo.");
      }
      const coordinate = { latitude, longitude };
      setDeviceCoordinate(coordinate);

      // Nunca reutilizar un lugar guardado ni un nombre de prueba.
      // El registro representa exclusivamente la coordenada real de este dispositivo.
    return coordinate;
  };

  const handleCheckIn = async () => {
    if (!user) return;

    try {
      setIsSubmitting(true);
      const coordinate = await resolveCurrentCoordinates();
      if (Platform.OS !== "web") await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const { data, error } = await supabase.rpc("start_my_checkin", {
        p_lat: coordinate.latitude,
        p_lng: coordinate.longitude,
      });
      if (error) throw error;
      const result = data as { id: number; venue_id: number; venue_name: string; created_at: string };

      setActiveCheckin({
        id: result.id,
        venueId: result.venue_id,
        venueName: result.venue_name,
        createdAt: result.created_at,
      });
      setShowVenuePicker(false);

      // Expo Go no incluye notificaciones remotas desde SDK 53. La APK nativa sí.
      // Evitamos incluso cargar el módulo en Expo Go para que no aparezca el error rojo.
      const isExpoGo = Constants.appOwnership === "expo";
      if (Platform.OS !== "web" && !isExpoGo) {
        const Notifications = await import("expo-notifications");
        await Notifications.scheduleNotificationAsync({
          content: { title: "Brindis compartido", body: "Estás tomando algo", data: { screen: "friends" } },
          trigger: null,
        });
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      Alert.alert("Brindis activo", "Tu ubicación GPS actual quedó registrada.");
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "No se pudo brindar.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCheckOut = async () => {
    if (!user) return;
    try {
      setIsSubmitting(true);
      const { error } = activeCheckin
        ? await supabase.rpc("deactivate_my_checkin", { p_checkin_id: activeCheckin.id })
        : { error: null };
      if (error) throw error;
      setActiveCheckin(null);
      Alert.alert("Brindis terminado", "Tus amigos verán que terminaste tu visita.");
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "No se pudo terminar el brindis.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isCheckedIn = Boolean(activeCheckin);

  return (
    <ScreenContainer className="p-6">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        <View className="flex-1 justify-center gap-7">
          <View className="items-center gap-2">
            <Text className="text-4xl font-bold text-foreground">{isCheckedIn ? "¡Brindis activo!" : "¿Dónde estás?"}</Text>
            <Text className="text-center text-base text-muted">{isCheckedIn ? "Brindando desde tu ubicación actual" : "Notifica a tus amigos dónde estás tomando algo"}</Text>
          </View>

          <View className="items-center">
            <Pressable onPress={isCheckedIn ? handleCheckOut : handleCheckIn} disabled={isSubmitting} style={({ pressed }) => ({ width: 196, height: 196, alignItems: "center", justifyContent: "center", borderRadius: 98, backgroundColor: isCheckedIn ? colors.success : colors.primary, transform: [{ scale: pressed && !isSubmitting ? 0.95 : 1 }], opacity: isSubmitting ? 0.7 : 1 })}>
              <BebeConmigoCan width={126} height={178} accessibilityLabel="Lata Bebe Conmigo" />
            </Pressable>
            <Text className="mt-6 text-lg font-semibold text-foreground">{isCheckedIn ? "Terminar brindis" : "Brindar"}</Text>
          </View>

          <Pressable onPress={() => router.push("/(tabs)/map")} style={({ pressed }) => ({ alignItems: "center", borderRadius: 12, borderColor: colors.border, borderWidth: 1, paddingVertical: 12, opacity: pressed ? 0.7 : 1 })}>
            <Text className="font-semibold text-foreground">Ver amigos en el mapa</Text>
          </Pressable>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
