import { ScreenContainer } from "@/components/screen-container";
import { BebeConmigoCan } from "@/components/bebe-conmigo-can";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { useAppRefresh } from "@/lib/app-refresh";
import { supabase } from "@/lib/supabase";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import Constants from "expo-constants";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Image as RNImage, Platform, Pressable, ScrollView, Text, View } from "react-native";

type Coordinates = { latitude: number; longitude: number };

type ActiveCheckin = {
  id: number;
  venueId: number;
  venueName: string;
  createdAt: string;
};

type CheckinVisibility = "friends" | "everyone" | "friends_except";

export default function HomeScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user } = useAuth({ autoFetch: true });
  const { revision } = useAppRefresh();

  const [activeCheckin, setActiveCheckin] = useState<ActiveCheckin | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkinVisibility, setCheckinVisibility] = useState<CheckinVisibility>("friends");
  const hasLoadedHomeOnce = useRef(false);

  const fetchData = useCallback(async () => {
    if (!user) {
      setActiveCheckin(null);
      return;
    }

    try {
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
    return () => {
      cancelled = true;
    };
  }, [revision, user]);

  const resolveCurrentCoordinates = async (): Promise<Coordinates> => {
    if (Platform.OS === "web") throw new Error("Brindar automáticamente está disponible en el APK móvil.");
    const permission = await Location.getForegroundPermissionsAsync();
    const permissionResult =
      permission.status === Location.PermissionStatus.GRANTED
        ? permission
        : await Location.requestForegroundPermissionsAsync();
    if (permissionResult.status !== Location.PermissionStatus.GRANTED) {
      throw new Error("Permite la ubicación para brindar en el punto donde estás.");
    }
    const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    const { latitude, longitude, accuracy } = current.coords;
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new Error("El GPS devolvió una ubicación inválida. Inténtalo de nuevo.");
    }
    if (accuracy != null && accuracy > 1000) {
      throw new Error("La precisión del GPS es insuficiente. Activa la ubicación precisa e inténtalo de nuevo.");
    }
    return { latitude, longitude };
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
        p_visibility: checkinVisibility,
        p_excluded_user_ids: [],
        p_allowed_user_ids: [],
      });
      if (error) throw error;
      const result = data as { id: number; venue_id: number; venue_name: string; created_at: string };

      setActiveCheckin({
        id: result.id,
        venueId: result.venue_id,
        venueName: result.venue_name,
        createdAt: result.created_at,
      });

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
            <Text className="text-4xl font-bold text-foreground">
              {isCheckedIn ? "¡Brindis activo!" : "¿Dónde estás?"}
            </Text>
            <Text className="text-center text-base text-muted">
              {isCheckedIn
                ? "Brindando desde tu ubicación actual"
                : "Notifica a tus amigos dónde estás tomando algo"}
            </Text>
          </View>

          <View className="items-center">
            <Pressable
              onPress={isCheckedIn ? handleCheckOut : handleCheckIn}
              disabled={isSubmitting}
              style={({ pressed }) => ({
                width: 196,
                height: 196,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 98,
                backgroundColor: isCheckedIn ? colors.success : colors.primary,
                transform: [{ scale: pressed && !isSubmitting ? 0.95 : 1 }],
                opacity: isSubmitting ? 0.7 : 1,
              })}
            >
              <BebeConmigoCan width={126} height={178} accessibilityLabel="Lata Bebe Conmigo" />
            </Pressable>

            {!isCheckedIn ? (
              <View className="mt-4 w-full flex-row flex-wrap justify-center gap-2">
                {(
                  [
                    { id: "friends" as const, label: "Amigos" },
                    { id: "everyone" as const, label: "Todos" },
                    { id: "friends_except" as const, label: "Amigos*" },
                  ] as const
                ).map((option) => {
                  const selected = checkinVisibility === option.id;
                  return (
                    <Pressable
                      key={option.id}
                      onPress={() => setCheckinVisibility(option.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Visibilidad: ${option.label}`}
                      style={{
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: selected ? colors.primary : colors.border,
                        backgroundColor: selected ? `${colors.primary}22` : colors.surface,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                      }}
                    >
                      <Text
                        style={{
                          color: selected ? colors.primary : colors.muted,
                          fontSize: 12,
                          fontWeight: "700",
                        }}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            <Text className="mt-6 text-lg font-semibold text-foreground">
              {isCheckedIn ? "Terminar brindis" : "Brindar"}
            </Text>
          </View>

          <Pressable
            onPress={() => router.push("/(tabs)/map")}
            style={({ pressed }) => ({
              alignItems: "center",
              borderRadius: 12,
              borderColor: colors.border,
              borderWidth: 1,
              paddingVertical: 12,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text className="font-semibold text-foreground">Ver amigos en el mapa</Text>
          </Pressable>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
