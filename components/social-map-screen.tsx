import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { BebeConmigoCan } from "@/components/bebe-conmigo-can";
import { useAuth } from "@/hooks/use-auth";
import { useAppRefresh } from "@/lib/app-refresh";
import { fetchMapActivity, type FriendCheckinMarker } from "@/lib/friend-checkins";
import { syncProfileLocation } from "@/lib/location-sharing";
import { distanceInKm, filterMapVenues, formatVenueDistance, VENUE_CATEGORIES, VENUE_CATEGORY_LABELS, venueStatusLabel, type MapVenue, type VenueCategory } from "@/lib/map-venues";
import { supabase } from "@/lib/supabase";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Location from "expo-location";
import { Image as ExpoImage } from "expo-image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import MapView, { Circle, Marker, PROVIDER_GOOGLE, type Region } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

type Coordinates = { latitude: number; longitude: number };
type TopVenueMarker = { id: number; name: string; latitude: number; longitude: number; admin_rank: number };

type SocialMapScreenProps = { useGoogleProvider?: boolean };
const LOCATION_OPTIONS: Location.LocationOptions = { accuracy: Location.Accuracy.Balanced, timeInterval: 15_000, distanceInterval: 25 };
const mapRegionFor = (coordinates: Coordinates): Region => ({ ...coordinates, latitudeDelta: 0.02, longitudeDelta: 0.02 });

const CLEAN_MAP_STYLE = [
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "landscape", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9CA3AF" }] },
  { featureType: "road", elementType: "labels.text.stroke", stylers: [{ color: "#101010" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#D1D5DB" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0C2533" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#111827" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#263244" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3C4D63" }] },
];

function venueColor(category: VenueCategory) {
  if (category === "club") return "#A855F7";
  if (category === "event") return "#FC4C02";
  if (category === "cafe") return "#D97706";
  if (category === "restaurant") return "#EF4444";
  return "#FC4C02";
}

export function SocialMapScreen({ useGoogleProvider = false }: SocialMapScreenProps) {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ focusLat?: string; focusLng?: string; focusName?: string; focusVenueId?: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth({ autoFetch: true });
  const { revision } = useAppRefresh();
  const mapRef = useRef<MapView | null>(null);
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const venueReconcileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canSyncLocationRef = useRef(false);
  const didCenterInitiallyRef = useRef(false);
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [friendMarkers, setFriendMarkers] = useState<FriendCheckinMarker[]>([]);
  const [hotZoneCount, setHotZoneCount] = useState(0);
  const [hotZoneRadius, setHotZoneRadius] = useState(50);
  const [hotZoneCenter, setHotZoneCenter] = useState<Coordinates | null>(null);
  const [topVenues, setTopVenues] = useState<TopVenueMarker[]>([]);
  const [venues, setVenues] = useState<MapVenue[]>([]);
  const [selectedVenue, setSelectedVenue] = useState<MapVenue | null>(null);
  const [category, setCategory] = useState<VenueCategory>("all");
  const [permission, setPermission] = useState<Location.PermissionStatus | "checking">("checking");
  const [servicesEnabled, setServicesEnabled] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [is3D, setIs3D] = useState(false);
  const [isRealistic, setIsRealistic] = useState(false);

  const mapVenueFromRow = useCallback((venue: any): MapVenue | null => {
    if (venue?.latitude == null || venue?.longitude == null) return null;
    return { ...venue, category: (venue.category || "bar") as VenueCategory, latitude: Number(venue.latitude), longitude: Number(venue.longitude), status: (venue.venue_status || "unknown") as MapVenue["status"] } as MapVenue;
  }, []);
  const loadVenues = useCallback(async () => {
    const { data, error } = await supabase.from("venues").select("id, name, category, latitude, longitude, address, city, admin_photo_url, rating, opening_hours, venue_status, active_promotion").not("latitude", "is", null).not("longitude", "is", null).limit(300);
    if (error) { console.warn("Venue pins unavailable:", error.message); return; }
    setVenues((data ?? []).map(mapVenueFromRow).filter((venue): venue is MapVenue => Boolean(venue)));
  }, [mapVenueFromRow]);
  const visibleVenues = useMemo(() => filterMapVenues(venues, category), [category, venues]);

  const loadTopVenues = useCallback(async () => {
    const { data } = await supabase.from("venues").select("id, name, latitude, longitude, admin_rank").not("admin_rank", "is", null).not("latitude", "is", null).not("longitude", "is", null).order("admin_rank", { ascending: true }).limit(5);
    setTopVenues((data ?? []).filter((venue) => venue.latitude != null && venue.longitude != null) as TopVenueMarker[]);
  }, []);
  const loadFriendMarkers = useCallback(async () => {
    if (!user) { setFriendMarkers([]); return; }
    try { const activity = await fetchMapActivity(); setFriendMarkers(activity.markers.filter((marker) => marker.userId !== user.id)); setHotZoneCount(activity.totalCount); setHotZoneRadius(activity.hotZoneRadius); setHotZoneCenter(activity.center); } catch (error) { console.warn("Friend markers unavailable:", error); }
  }, [user]);
  const loadActiveState = useCallback(async () => {
    if (!user) { setIsActive(false); return; }
    const { data, error } = await supabase.from("checkins").select("id, is_active, expires_at, venues(latitude, longitude)").eq("user_id", user.id).eq("status", "active").eq("is_active", true).gt("expires_at", new Date().toISOString()).limit(1).maybeSingle();
    if (!error) { setIsActive(Boolean(data)); const venue = data?.venues as { latitude?: number | null; longitude?: number | null } | null; if (venue?.latitude != null && venue?.longitude != null) setCoordinates({ latitude: venue.latitude, longitude: venue.longitude }); }
  }, [user]);

  useEffect(() => {
    void loadVenues(); void loadFriendMarkers(); void loadTopVenues(); void loadActiveState();
    const channel = supabase.channel(`junta2-map-${user?.id ?? "public"}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "venues" }, ({ new: row }) => setVenues((current) => { const next = mapVenueFromRow(row); return next ? [...current.filter((venue) => venue.id !== next.id), next] : current; }))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "venues" }, ({ new: row }) => setVenues((current) => { const next = mapVenueFromRow(row); return next ? [...current.filter((venue) => venue.id !== next.id), next] : current.filter((venue) => venue.id !== row.id); }))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "venues" }, ({ old: row }) => setVenues((current) => current.filter((venue) => venue.id !== row.id)))
      .on("postgres_changes", { event: "*", schema: "public", table: "venues" }, () => { if (venueReconcileTimerRef.current) clearTimeout(venueReconcileTimerRef.current); venueReconcileTimerRef.current = setTimeout(() => { void loadVenues(); void loadTopVenues(); }, 350); })
      .on("postgres_changes", { event: "*", schema: "public", table: "checkins" }, () => { void loadFriendMarkers(); void loadActiveState(); }).subscribe();
    return () => { if (venueReconcileTimerRef.current) clearTimeout(venueReconcileTimerRef.current); void supabase.removeChannel(channel); };
  }, [loadActiveState, loadFriendMarkers, loadTopVenues, loadVenues, mapVenueFromRow, revision, user?.id]);

  const applyLocation = useCallback((location: Location.LocationObject) => { const next = { latitude: location.coords.latitude, longitude: location.coords.longitude }; setCoordinates(next); if (canSyncLocationRef.current && user) void syncProfileLocation(user.id, next.latitude, next.longitude); setErrorMessage(null); }, [user]);
  const startTracking = useCallback(async () => {
    if (Platform.OS === "web") { setPermission(Location.PermissionStatus.DENIED); setErrorMessage("La ubicación real solo está disponible en la aplicación móvil."); return; }
    setIsRefreshing(true); setErrorMessage(null); subscriptionRef.current?.remove(); subscriptionRef.current = null;
    try {
      const enabled = await Location.hasServicesEnabledAsync(); setServicesEnabled(enabled); if (!enabled) { setErrorMessage("Activa el servicio de ubicación del teléfono para continuar."); return; }
      if (user) { const { data: privacy } = await supabase.from("profiles").select("is_public, discoverable_nearby, location_sharing").eq("id", user.id).maybeSingle(); canSyncLocationRef.current = Boolean(privacy?.is_public && privacy?.discoverable_nearby && privacy?.location_sharing); }
      const currentPermission = await Location.getForegroundPermissionsAsync(); const permissionResult = currentPermission.status === Location.PermissionStatus.GRANTED ? currentPermission : await Location.requestForegroundPermissionsAsync(); setPermission(permissionResult.status); if (permissionResult.status !== Location.PermissionStatus.GRANTED) { setErrorMessage("Permite la ubicación mientras usas Junta2 para mostrarte en el mapa."); return; }
      applyLocation(await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced, mayShowUserSettingsDialog: true })); subscriptionRef.current = await Location.watchPositionAsync(LOCATION_OPTIONS, applyLocation);
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : "No pudimos obtener tu ubicación."); } finally { setIsRefreshing(false); }
  }, [applyLocation, user]);
  useEffect(() => { void startTracking(); return () => { subscriptionRef.current?.remove(); subscriptionRef.current = null; canSyncLocationRef.current = false; }; }, [revision, startTracking]);

  const cameraFor = (next: Coordinates, perspective3D: boolean) => ({ center: next, pitch: perspective3D ? 48 : 0, heading: 0, altitude: perspective3D ? 980 : 1500, zoom: perspective3D ? 15.5 : 14.5 });
  useEffect(() => { if (!mapReady) return; const latitude = Number(params.focusLat); const longitude = Number(params.focusLng); if (Number.isFinite(latitude) && Number.isFinite(longitude)) mapRef.current?.animateCamera(cameraFor({ latitude, longitude }, is3D), { duration: 520 }); }, [is3D, mapReady, params.focusLat, params.focusLng]);
  useEffect(() => { if (!params.focusVenueId || !venues.length) return; const venue = venues.find((item) => String(item.id) === String(params.focusVenueId)); if (!venue) return; setSelectedVenue(venue); if (mapReady) mapRef.current?.animateCamera(cameraFor(venue, is3D), { duration: 520 }); }, [is3D, mapReady, params.focusVenueId, venues]);
  useEffect(() => { if (!coordinates || !mapReady || didCenterInitiallyRef.current || params.focusLat || params.focusVenueId) return; didCenterInitiallyRef.current = true; mapRef.current?.animateToRegion(mapRegionFor(coordinates), 420); }, [coordinates, mapReady, params.focusLat, params.focusVenueId]);

  const distanceLabel = selectedVenue && coordinates ? formatVenueDistance(distanceInKm(coordinates, selectedVenue)) : "Distancia no disponible";
  const openVenueProfile = () => { if (!selectedVenue) return; router.push({ pathname: "/(tabs)/events", params: { venueId: String(selectedVenue.id) } }); };
  const statusText = hotZoneCount === 1 ? "1 amigo con brindis activo" : hotZoneCount > 1 ? `${hotZoneCount} amigos con brindis activo` : "Mapa en tiempo real";

  return (
    <View style={[styles.root, { backgroundColor: colors.abyss }]}>
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <MapView ref={mapRef} style={StyleSheet.absoluteFill} provider={useGoogleProvider ? PROVIDER_GOOGLE : undefined} initialRegion={coordinates ? mapRegionFor(coordinates) : undefined} initialCamera={coordinates ? cameraFor(coordinates, is3D) : undefined} mapType={isRealistic ? "satellite" : "standard"} customMapStyle={isRealistic ? undefined : CLEAN_MAP_STYLE} pitchEnabled rotateEnabled showsBuildings={false} showsPointsOfInterest={false} showsCompass={false} showsUserLocation={false} showsMyLocationButton={false} loadingEnabled={false} onMapReady={() => setMapReady(true)}>
        {visibleVenues.map((venue) => <Marker key={`venue-${venue.id}`} coordinate={venue} onPress={() => setSelectedVenue(venue)} anchor={{ x: 0.5, y: 0.92 }} tracksViewChanges={false} accessibilityLabel={`Local ${venue.name}`}><View style={[styles.venuePin, { backgroundColor: venueColor(venue.category) }]}><MaterialIcons name={venue.category === "cafe" ? "local-cafe" : venue.category === "club" ? "nightlife" : venue.category === "event" ? "event" : "local-bar"} size={19} color="#FFFFFF" /></View></Marker>)}
        {isActive && coordinates ? <Marker key="my-active-checkin" coordinate={coordinates} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges><View style={styles.beerMarker}><BebeConmigoCan width={44} height={68} /></View></Marker> : null}
        {topVenues.filter((venue) => !venues.some((item) => item.id === venue.id)).map((venue) => <Marker key={`top-venue-${venue.id}`} coordinate={{ latitude: venue.latitude, longitude: venue.longitude }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}><View style={styles.starMarker}><MaterialIcons name="star" size={34} color="#F4C542" /><Text style={styles.starMarkerRank}>{venue.admin_rank}</Text></View></Marker>)}
        {hotZoneCenter && hotZoneCount > 0 ? <><Circle center={hotZoneCenter} radius={hotZoneRadius} fillColor="rgba(239, 68, 68, 0.18)" strokeColor="rgba(248, 113, 113, 0.82)" strokeWidth={2} zIndex={1} /><Marker coordinate={hotZoneCenter} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false} zIndex={2}><View style={styles.hotZoneLabel}><Text style={styles.hotZoneLabelText}>{hotZoneCount} Brindis</Text></View></Marker></> : null}
        {friendMarkers.map((friend) => <Marker key={`${friend.id}-${friend.userId}`} coordinate={{ latitude: friend.latitude, longitude: friend.longitude }} title={friend.name} description={`${friend.venueName} · check-in activo`} tracksViewChanges={false}><View style={styles.beerMarker}><BebeConmigoCan width={44} height={68} /></View></Marker>)}
      </MapView>

      <View style={styles.headerWrap}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}><Text style={styles.headerTitle}>Descubre cerca</Text><Pressable accessibilityRole="button" accessibilityLabel={isRealistic ? "Cambiar a mapa estilizado" : "Cambiar a mapa satélite"} onPress={() => setIsRealistic((current) => !current)} style={styles.headerAction}><MaterialIcons name={isRealistic ? "map" : "satellite"} size={22} color="#FFFFFF" /></Pressable></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>{VENUE_CATEGORIES.map((item) => <Pressable key={item} onPress={() => setCategory(item)} accessibilityRole="button" accessibilityState={{ selected: category === item }} style={[styles.filterChip, category === item && styles.filterChipActive]}><Text style={[styles.filterText, category === item && styles.filterTextActive]}>{VENUE_CATEGORY_LABELS[item]}</Text></Pressable>)}</ScrollView>
      </View>
      {hotZoneCount > 0 ? <View style={[styles.liveChip, { top: insets.top + 150 }]}><View style={[styles.liveDot, { backgroundColor: colors.success }]} /><Text style={styles.liveChipText}>{statusText}</Text></View> : null}

      {selectedVenue ? <Pressable onPress={openVenueProfile} accessibilityRole="button" accessibilityLabel={`Abrir perfil de ${selectedVenue.name}`} style={[styles.previewCard, { bottom: insets.bottom + 92, backgroundColor: colors.surface }]}>
        {selectedVenue.admin_photo_url ? <ExpoImage source={{ uri: selectedVenue.admin_photo_url }} cachePolicy="memory-disk" contentFit="cover" style={styles.previewImage} /> : <View style={[styles.previewImage, styles.previewPlaceholder, { backgroundColor: venueColor(selectedVenue.category) }]}><MaterialIcons name="place" size={34} color="#FFFFFF" /></View>}
        <View style={styles.previewContent}><View style={styles.previewTitleRow}><Text numberOfLines={1} style={[styles.previewTitle, { color: colors.foreground }]}>{selectedVenue.name}</Text><Pressable onPress={(event) => { event.stopPropagation(); setSelectedVenue(null); }} accessibilityLabel="Cerrar vista previa" hitSlop={8}><MaterialIcons name="close" size={20} color={colors.muted} /></Pressable></View><Text style={[styles.previewMeta, { color: colors.muted }]}>{venueStatusLabel(selectedVenue.status)} · {distanceLabel}</Text><Text style={[styles.previewMeta, { color: colors.muted }]}>{selectedVenue.rating != null ? `★ ${selectedVenue.rating.toFixed(1)}` : "Sin calificación"}{selectedVenue.opening_hours ? ` · ${selectedVenue.opening_hours}` : ""}</Text>{selectedVenue.active_promotion ? <View style={styles.promoBadge}><Text style={styles.promoText}>{selectedVenue.active_promotion}</Text></View> : null}<Text style={[styles.openHint, { color: colors.primary }]}>Ver perfil del local →</Text></View>
      </Pressable> : null}

      {!coordinates ? <View style={[styles.permissionCard, { bottom: insets.bottom + 32 }]}><IconSymbol name="location.fill" size={30} color={colors.primary} /><Text style={styles.permissionTitle}>Activa tu mapa en vivo</Text><Text style={styles.permissionBody}>{errorMessage ?? "Permite la ubicación para centrar el mapa y mostrar distancias."}</Text><Pressable onPress={() => (permission === Location.PermissionStatus.DENIED || servicesEnabled === false ? void Linking.openSettings() : void startTracking())} style={styles.permissionButton}><Text style={styles.permissionButtonText}>{permission === Location.PermissionStatus.DENIED || servicesEnabled === false ? "Abrir ajustes" : "Permitir ubicación"}</Text></Pressable></View> : <View style={[styles.controls, { bottom: insets.bottom + 22 }]}><Pressable accessibilityRole="button" accessibilityLabel={is3D ? "Cambiar a vista 2D" : "Cambiar a vista 3D"} onPress={() => { const next = !is3D; setIs3D(next); if (coordinates) void mapRef.current?.animateCamera(cameraFor(coordinates, next), { duration: 420 }); }} style={styles.floatingButton}><Text style={styles.controlText}>{is3D ? "3D" : "2D"}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Centrar mapa en mi ubicación" onPress={() => coordinates ? mapRef.current?.animateCamera(cameraFor(coordinates, is3D), { duration: 420 }) : void startTracking()} style={styles.floatingButton}>{isRefreshing ? <ActivityIndicator color="#FFFFFF" /> : <IconSymbol name="location.fill" size={25} color="#FFFFFF" />}</Pressable></View>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: "hidden" },
  headerWrap: { position: "absolute", top: 0, left: 0, right: 0, backgroundColor: "rgba(8, 10, 15, 0.94)", paddingBottom: 10 },
  header: { minHeight: 76, paddingHorizontal: 18, paddingBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerTitle: { color: "#FFFFFF", fontSize: 27, fontWeight: "800", letterSpacing: -0.5 },
  headerAction: { width: 44, height: 44, borderRadius: 14, backgroundColor: "#FFFFFF14", alignItems: "center", justifyContent: "center" },
  filterRow: { paddingHorizontal: 16, gap: 8 },
  filterChip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: "#FFFFFF20", justifyContent: "center", backgroundColor: "#FFFFFF08" },
  filterChipActive: { backgroundColor: "#FC4C02", borderColor: "#FC4C02" },
  filterText: { color: "#D1D5DB", fontWeight: "800", fontSize: 12 },
  filterTextActive: { color: "#FFFFFF" },
  liveChip: { position: "absolute", left: 16, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: "#FFFFFF22", backgroundColor: "rgba(3, 8, 18, 0.88)" },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveChipText: { color: "#F7FBFF", fontSize: 12, fontWeight: "700" },
  venuePin: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "#FFFFFF", shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 5, shadowOffset: { width: 0, height: 3 }, elevation: 7 },
  beerMarker: { width: 38, height: 58, alignItems: "center", justifyContent: "center", shadowColor: "#000000", shadowOpacity: 0.55, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 7 },
  starMarker: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  starMarkerRank: { position: "absolute", color: "#07111F", fontSize: 11, fontWeight: "900", top: 16 },
  hotZoneLabel: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, backgroundColor: "rgba(3, 8, 18, 0.92)", borderWidth: 1, borderColor: "rgba(248, 113, 113, 0.65)" },
  hotZoneLabelText: { color: "#FFF7F7", fontSize: 13, fontWeight: "900" },
  previewCard: { position: "absolute", left: 16, right: 16, minHeight: 126, borderRadius: 24, padding: 10, flexDirection: "row", gap: 12, shadowColor: "#000", shadowOpacity: 0.24, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 9 },
  previewImage: { width: 106, height: 106, borderRadius: 17 },
  previewPlaceholder: { alignItems: "center", justifyContent: "center" },
  previewContent: { flex: 1, paddingVertical: 3 },
  previewTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  previewTitle: { flex: 1, fontSize: 18, fontWeight: "900" },
  previewMeta: { marginTop: 5, fontSize: 12, fontWeight: "600" },
  promoBadge: { alignSelf: "flex-start", marginTop: 7, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: "#FC4C0220" },
  promoText: { color: "#FC4C02", fontSize: 11, fontWeight: "900" },
  openHint: { marginTop: 8, fontSize: 12, fontWeight: "900" },
  controls: { position: "absolute", right: 18, gap: 12 },
  floatingButton: { width: 54, height: 54, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0, 0, 0, 0.92)", borderWidth: 1, borderColor: "#FFFFFF1C", elevation: 6 },
  controlText: { color: "#F7FBFF", fontSize: 14, fontWeight: "900" },
  permissionCard: { position: "absolute", left: 18, right: 18, alignItems: "center", borderRadius: 24, borderWidth: 1, borderColor: "#FFFFFF1C", padding: 22, backgroundColor: "rgba(5, 10, 20, 0.96)" },
  permissionTitle: { marginTop: 12, color: "#F7FBFF", fontSize: 19, fontWeight: "800" },
  permissionBody: { marginTop: 8, color: "#A9B8C8", fontSize: 13, lineHeight: 19, textAlign: "center" },
  permissionButton: { width: "100%", marginTop: 18, minHeight: 50, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#FC4C02" },
  permissionButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
});
