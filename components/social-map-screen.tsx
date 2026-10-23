import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { BebeConmigoCan } from "@/components/bebe-conmigo-can";
import { useAuth } from "@/hooks/use-auth";
import { useAppRefresh } from "@/lib/app-refresh";
import { fetchMapActivity, type FriendCheckinMarker } from "@/lib/friend-checkins";
import { syncProfileLocation } from "@/lib/location-sharing";
import { supabase } from "@/lib/supabase";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Location from "expo-location";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { Circle, Marker, PROVIDER_GOOGLE, type Region } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

type Coordinates = { latitude: number; longitude: number };
type TopVenueMarker = { id: number; name: string; latitude: number; longitude: number; admin_rank: number };

type SocialMapScreenProps = {
  useGoogleProvider?: boolean;
};

const LOCATION_OPTIONS: Location.LocationOptions = {
  accuracy: Location.Accuracy.Balanced,
  timeInterval: 15_000,
  distanceInterval: 25,
};

const mapRegionFor = (coordinates: Coordinates): Region => ({
  ...coordinates,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
});

/** Dark visual language inspired by the provided reference without copying its branding. */
const DARK_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#101B2E" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#DCE9F8" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#101B2E" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#2B4561" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#0A1625" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#16263B" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#123440" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#283B55" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#516B87" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1A2B42" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#1C3049" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#071D2A" }] },
];

export function SocialMapScreen({ useGoogleProvider = false }: SocialMapScreenProps) {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ focusLat?: string; focusLng?: string; focusName?: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth({ autoFetch: true });
  const { revision } = useAppRefresh();
  const mapRef = useRef<MapView | null>(null);
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const canSyncLocationRef = useRef(false);
  const didCenterInitiallyRef = useRef(false);
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [friendMarkers, setFriendMarkers] = useState<FriendCheckinMarker[]>([]);
  const [hotZoneCount, setHotZoneCount] = useState(0);
  const [hotZoneRadius, setHotZoneRadius] = useState(50);
  const [hotZoneCenter, setHotZoneCenter] = useState<Coordinates | null>(null);
  const [topVenues, setTopVenues] = useState<TopVenueMarker[]>([]);
  const [permission, setPermission] = useState<Location.PermissionStatus | "checking">("checking");
  const [servicesEnabled, setServicesEnabled] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [is3D, setIs3D] = useState(true);
  const [isRealistic, setIsRealistic] = useState(false);

  const loadTopVenues = useCallback(async () => {
    const { data } = await supabase.from("venues").select("id, name, latitude, longitude, admin_rank").not("admin_rank", "is", null).not("latitude", "is", null).not("longitude", "is", null).order("admin_rank", { ascending: true }).limit(5);
    setTopVenues((data ?? []).filter((venue) => venue.latitude != null && venue.longitude != null) as TopVenueMarker[]);
  }, []);

  const loadFriendMarkers = useCallback(async () => {
    if (!user) {
      setFriendMarkers([]);
      return;
    }
    try {
      const activity = await fetchMapActivity();
      setFriendMarkers(activity.markers.filter((marker) => marker.userId !== user.id));
      setHotZoneCount(activity.totalCount);
      setHotZoneRadius(activity.hotZoneRadius);
      setHotZoneCenter(activity.center);
    } catch (error) {
      console.warn("Friend markers unavailable:", error);
    }
  }, [user]);

  const loadActiveState = useCallback(async () => {
    if (!user) {
      setIsActive(false);
      return;
    }
    const { data, error } = await supabase
      .from("checkins")
      .select("id, is_active, expires_at, venues(latitude, longitude)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .eq("is_active", true)
      .gt("expires_at", new Date().toISOString())
      .limit(1)
      .maybeSingle();
    if (!error) {
      setIsActive(Boolean(data));
      const venue = data?.venues as { latitude?: number | null; longitude?: number | null } | null;
      if (venue?.latitude != null && venue?.longitude != null) {
        setCoordinates({ latitude: venue.latitude, longitude: venue.longitude });
      }
    }
  }, [user]);

  useEffect(() => {
    void loadFriendMarkers();
    void loadTopVenues();
    void loadActiveState();
    if (!user) return;
    const channel = supabase
      .channel(`tragos-sociales-map-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "checkins" }, () => {
        void loadFriendMarkers();
        void loadActiveState();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "venues" }, () => void loadTopVenues())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadActiveState, loadFriendMarkers, loadTopVenues, revision, user]);

  const applyLocation = useCallback((location: Location.LocationObject) => {
    const nextCoordinates = { latitude: location.coords.latitude, longitude: location.coords.longitude };
    setCoordinates(nextCoordinates);
    if (canSyncLocationRef.current && user) {
      void syncProfileLocation(user.id, nextCoordinates.latitude, nextCoordinates.longitude);
    }
    setErrorMessage(null);
  }, [user]);

  const startTracking = useCallback(async () => {
    if (Platform.OS === "web") {
      setPermission(Location.PermissionStatus.DENIED);
      setErrorMessage("La ubicación real solo está disponible en la aplicación móvil.");
      return;
    }

    setIsRefreshing(true);
    setErrorMessage(null);
    subscriptionRef.current?.remove();
    subscriptionRef.current = null;

    try {
      const enabled = await Location.hasServicesEnabledAsync();
      setServicesEnabled(enabled);
      if (!enabled) {
        setErrorMessage("Activa el servicio de ubicación del teléfono para continuar.");
        return;
      }

      if (user) {
        const { data: privacy } = await supabase
          .from("profiles")
          .select("is_public, discoverable_nearby, location_sharing")
          .eq("id", user.id)
          .maybeSingle();
        canSyncLocationRef.current = Boolean(privacy?.is_public && privacy?.discoverable_nearby && privacy?.location_sharing);
      }

      const currentPermission = await Location.getForegroundPermissionsAsync();
      const permissionResult = currentPermission.status === Location.PermissionStatus.GRANTED
        ? currentPermission
        : await Location.requestForegroundPermissionsAsync();
      setPermission(permissionResult.status);
      if (permissionResult.status !== Location.PermissionStatus.GRANTED) {
        setErrorMessage("Permite la ubicación mientras usas Tragos Sociales para mostrarte en el mapa.");
        return;
      }

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        mayShowUserSettingsDialog: true,
      });
      applyLocation(current);
      subscriptionRef.current = await Location.watchPositionAsync(LOCATION_OPTIONS, applyLocation);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No pudimos obtener tu ubicación.");
    } finally {
      setIsRefreshing(false);
    }
  }, [applyLocation, user]);

  useEffect(() => {
    void startTracking();
    return () => {
      subscriptionRef.current?.remove();
      subscriptionRef.current = null;
      canSyncLocationRef.current = false;
    };
  }, [revision, startTracking]);

  const region = coordinates ? mapRegionFor(coordinates) : null;

  useEffect(() => {
    if (!mapReady) return;
    const latitude = Number(params.focusLat);
    const longitude = Number(params.focusLng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    mapRef.current?.animateCamera(cameraFor({ latitude, longitude }, is3D), { duration: 520 });
  }, [is3D, mapReady, params.focusLat, params.focusLng]);

  useEffect(() => {
    if (!region || !mapReady || didCenterInitiallyRef.current || params.focusLat) return;
    didCenterInitiallyRef.current = true;
    mapRef.current?.animateToRegion(region, 420);
  }, [mapReady, params.focusLat, region]);

  const cameraFor = (nextCoordinates: Coordinates, perspective3D: boolean) => ({
    center: nextCoordinates,
    pitch: perspective3D ? 54 : 0,
    heading: 0,
    altitude: perspective3D ? 980 : 1500,
    zoom: perspective3D ? 15.5 : 14.5,
  });

  const handleCenter = () => {
    if (!coordinates) {
      void startTracking();
      return;
    }
    mapRef.current?.animateCamera(cameraFor(coordinates, is3D), { duration: 420 });
  };

  const handleToggle3D = () => {
    const next = !is3D;
    setIs3D(next);
    if (coordinates) {
      void mapRef.current?.animateCamera(cameraFor(coordinates, next), { duration: 420 });
    }
  };

  const handlePermissionAction = () => {
    if (permission === Location.PermissionStatus.DENIED || servicesEnabled === false) {
      void Linking.openSettings();
      return;
    }
    void startTracking();
  };

  const statusText = hotZoneCount === 1
      ? "1 amigo con brindis activo"
      : hotZoneCount > 1
        ? `${hotZoneCount} amigos con brindis activo`
        : "Mapa en tiempo real";

  return (
    <View style={[styles.root, { backgroundColor: colors.abyss }]}> 
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={useGoogleProvider ? PROVIDER_GOOGLE : undefined}
        initialRegion={region ?? undefined}
        initialCamera={coordinates ? cameraFor(coordinates, is3D) : undefined}
        mapType={isRealistic ? "satellite" : "standard"}
        customMapStyle={isRealistic ? undefined : DARK_MAP_STYLE}
        pitchEnabled
        rotateEnabled
        showsBuildings
        showsCompass={false}
        showsUserLocation={false}
        showsMyLocationButton={false}
        loadingEnabled={false}
        onMapReady={() => setMapReady(true)}
      >
        {isActive && coordinates ? (
          <Marker
            key="my-active-checkin"
            coordinate={coordinates}
            title="Tu check-in activo"
            description="Estás activo aquí"
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={true}
          >
              <View style={styles.beerMarker}>
                <BebeConmigoCan width={44} height={68} />
              </View>
          </Marker>
        ) : null}
        {topVenues.map((venue) => {
          const starColors = ["#F4C542", "#C9D1D9", "#B8794A", "#3B82F6", "#A855F7"];
          return <Marker key={`top-venue-${venue.id}`} coordinate={{ latitude: venue.latitude, longitude: venue.longitude }} title={venue.name} description={`Top ${venue.admin_rank}`} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.starMarker}><MaterialIcons name="star" size={34} color={starColors[(venue.admin_rank ?? 1) - 1] ?? "#F4C542"} /><Text style={styles.starMarkerRank}>{venue.admin_rank}</Text></View>
          </Marker>;
        })}
        {hotZoneCenter && hotZoneCount > 0 ? (
          <>
            <Circle
              center={hotZoneCenter}
              radius={hotZoneRadius}
              fillColor="rgba(239, 68, 68, 0.18)"
              strokeColor="rgba(248, 113, 113, 0.82)"
              strokeWidth={2}
              zIndex={1}
            />
            <Marker coordinate={hotZoneCenter} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false} zIndex={2}>
              <View style={styles.hotZoneLabel}>
                <Text style={styles.hotZoneLabelText}>{hotZoneCount} Brindis</Text>
              </View>
            </Marker>
          </>
        ) : null}
        {friendMarkers.map((friend) => (
          <Marker
            key={`${friend.id}-${friend.userId}`}
            coordinate={{ latitude: friend.latitude, longitude: friend.longitude }}
            title={friend.name}
            description={`${friend.venueName} · check-in activo`}
            tracksViewChanges={true}
          >
            <View style={styles.beerMarker}>
              <BebeConmigoCan width={44} height={68} />
            </View>
          </Marker>
        ))}
      </MapView>

      {Platform.OS === "ios" ? <View pointerEvents="none" style={styles.iosDarkVeil} /> : null}

      <View style={[styles.header, { paddingTop: insets.top + 10 }]}> 
        <Text style={styles.headerTitle}>Mapa</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isRealistic ? "Cambiar a mapa estilizado" : "Cambiar a mapa realista"}
          onPress={() => setIsRealistic((current) => !current)}
          style={({ pressed }) => [styles.headerAction, { opacity: pressed ? 0.7 : 1 }]}
        >
          <MaterialIcons name={isRealistic ? "map" : "satellite"} size={22} color="#F7FBFF" />
        </Pressable>
      </View>

      {hotZoneCount > 0 ? (
        <View style={[styles.liveChip, { top: insets.top + 82, borderColor: "#FFFFFF22" }]}> 
          <View style={[styles.liveDot, { backgroundColor: colors.success }]} />
          <Text style={styles.liveChipText}>{statusText}</Text>
        </View>
      ) : null}

      {!coordinates ? (
        <View style={[styles.permissionCard, { bottom: insets.bottom + 32 }]}> 
          <IconSymbol name="location.fill" size={30} color={colors.primary} />
          <Text style={styles.permissionTitle}>Activa tu mapa en vivo</Text>
          <Text style={styles.permissionBody}>{errorMessage ?? "Permite la ubicación para centrar el mapa en tu posición real y ver los check-ins de tus amigos."}</Text>
          <Pressable onPress={handlePermissionAction} style={({ pressed }) => [styles.permissionButton, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}>
              <Text style={styles.permissionButtonText}>{permission === Location.PermissionStatus.DENIED || servicesEnabled === false ? "Abrir ajustes" : "Permitir ubicación"}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={[styles.controls, { bottom: insets.bottom + 22 }]}> 
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={is3D ? "Cambiar a vista 2D" : "Cambiar a vista 3D"}
            onPress={handleToggle3D}
            style={({ pressed }) => [styles.floatingButton, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={styles.controlText}>{is3D ? "3D" : "2D"}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Centrar mapa en mi ubicación"
            onPress={handleCenter}
            style={({ pressed }) => [styles.floatingButton, { opacity: pressed ? 0.7 : 1 }]}
          >
            <IconSymbol name="location.fill" size={25} color="#F7FBFF" />
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: "hidden" },
  iosDarkVeil: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(4, 13, 28, 0.34)" },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    minHeight: 76,
    paddingHorizontal: 18,
    paddingBottom: 12,
    backgroundColor: "rgba(0, 0, 0, 0.94)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#FFFFFF14",
  },
  headerAction: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#FFFFFF12",
    alignItems: "center",
    justifyContent: "center",
  },
  headerActionText: { color: "#F7FBFF", fontSize: 14, fontWeight: "800", letterSpacing: 0.5 },
  headerTitle: { color: "#F7FBFF", fontSize: 27, fontWeight: "700", letterSpacing: -0.5 },
  liveChip: {
    position: "absolute",
    left: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "rgba(3, 8, 18, 0.88)",
  },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  starMarker: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  starMarkerRank: { position: "absolute", color: "#07111F", fontSize: 11, fontWeight: "900", top: 16 },
  beerMarker: {
    width: 38,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.55,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 7,
  },
  liveChipText: { color: "#F7FBFF", fontSize: 12, fontWeight: "700" },
  hotZoneLabel: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(3, 8, 18, 0.92)",
    borderWidth: 1,
    borderColor: "rgba(248, 113, 113, 0.65)",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  hotZoneLabelText: { color: "#FFF7F7", fontSize: 13, fontWeight: "900" },
  controls: { position: "absolute", right: 18, gap: 12 },
  floatingButton: {
    width: 54,
    height: 54,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.92)",
    borderWidth: 1,
    borderColor: "#FFFFFF1C",
    shadowColor: "#000000",
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  controlText: { color: "#F7FBFF", fontSize: 14, fontWeight: "900" },
  permissionCard: {
    position: "absolute",
    left: 18,
    right: 18,
    alignItems: "center",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#FFFFFF1C",
    padding: 22,
    backgroundColor: "rgba(5, 10, 20, 0.96)",
  },
  permissionTitle: { marginTop: 12, color: "#F7FBFF", fontSize: 19, fontWeight: "800" },
  permissionBody: { marginTop: 8, color: "#A9B8C8", fontSize: 13, lineHeight: 19, textAlign: "center" },
  permissionButton: { width: "100%", marginTop: 18, minHeight: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  permissionButtonText: { color: "#05070D", fontSize: 14, fontWeight: "800" },
});
