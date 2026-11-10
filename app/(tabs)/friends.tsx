import { ActivityIndicator, Alert, FlatList, Modal, Pressable, RefreshControl, Text, TextInput, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { router } from "expo-router";
import * as Location from "expo-location";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { useAppRefresh } from "@/lib/app-refresh";
import { supabase } from "@/lib/supabase";
import { KeyboardAvoidingView, Platform, TouchableOpacity } from "react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Image as ExpoImage } from "expo-image";

type Friend = {
  id: string;
  name: string;
  status: "offline" | "in_bar";
  bar?: string;
  checkInTime?: string;
  avatar: string;
  avatarUrl: string | null;
  hasActiveStory: boolean;
  hasStory: boolean;
};

type FriendshipRow = { id: number; user_id: string; friend_id: string; status: string; request_message?: string | null };
type PendingRequest = { id: number; senderId: string; name: string; avatarUrl: string | null; message: string | null };
type ProfileRow = { id: string; name: string | null; email: string | null; avatar_url?: string | null };
type NearbyProfile = { id: string; name: string | null; avatar_url: string | null; cover_url: string | null; distance_km: number };
type PublicSearchProfile = { id: string; name: string | null; username: string | null; avatar_url: string | null; cover_url: string | null; bio: string | null };
type CheckinRow = { user_id: string; created_at: string; venues: { name?: string | null } | null };
type StoryRow = { id: number; user_id: string };

function getDisplayName(profile: ProfileRow) {
  return profile.name?.trim() || profile.email?.split("@")[0]?.trim() || "";
}

function getInitials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

export default function FriendsScreen() {
  const colors = useColors();
  const { user } = useAuth({ autoFetch: true });
  const { revision } = useAppRefresh();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [friends, setFriends] = useState<Friend[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const hasLoadedFriendsOnce = useRef(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isQrVisible, setIsQrVisible] = useState(false);
  const [nearbyProfiles, setNearbyProfiles] = useState<NearbyProfile[]>([]);
  const [isLoadingNearby, setIsLoadingNearby] = useState(false);
  const [nearbyError, setNearbyError] = useState<string | null>(null);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [respondingRequestId, setRespondingRequestId] = useState<number | null>(null);
  const [friendsSection, setFriendsSection] = useState<"friends" | "requests">("friends");
  const [publicSearchResults, setPublicSearchResults] = useState<PublicSearchProfile[]>([]);
  const [isSearchingPublic, setIsSearchingPublic] = useState(false);

  const fetchNearbyProfiles = useCallback(async () => {
    if (!user) return;
    try {
      setIsLoadingNearby(true);
      setNearbyError(null);
      const permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        setNearbyError("Activa la ubicación desde Perfil para descubrir personas cercanas.");
        return;
      }
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { data, error } = await supabase.rpc("find_nearby_profiles", {
        p_lat: current.coords.latitude,
        p_lng: current.coords.longitude,
        p_radius_km: 5,
      });
      if (error) throw error;
      setNearbyProfiles((data ?? []) as NearbyProfile[]);
    } catch (error) {
      setNearbyError("No se pudieron buscar personas cercanas. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setIsLoadingNearby(false);
    }
  }, [user]);

  const fetchPendingRequests = useCallback(async () => {
    if (!user) return;
    const { data: requests, error } = await supabase
      .from("friendships")
      .select("id, user_id, friend_id, status, request_message")
      .eq("friend_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) {
      setRequestsError("No se pudieron cargar las solicitudes. Inténtalo de nuevo.");
      return;
    }
    setRequestsError(null);
    const rows = (requests ?? []) as FriendshipRow[];
    if (rows.length === 0) {
      setPendingRequests([]);
      return;
    }
    const senderIds = rows.map((row) => row.user_id);
    const { data: profiles, error: profilesError } = await supabase.rpc("get_visible_profiles", { p_ids: senderIds });
    if (profilesError) {
      setRequestsError("No se pudieron mostrar los perfiles de las solicitudes.");
      return;
    }
    const profileMap = new Map(
      ((profiles ?? []) as { id: string; name: string | null; avatar_url?: string | null }[]).map((profile) => [
        profile.id,
        { name: profile.name?.trim() || "Usuario", avatarUrl: profile.avatar_url ?? null },
      ]),
    );
    setPendingRequests(
      rows.map((row) => ({
        id: row.id,
        senderId: row.user_id,
        name: profileMap.get(row.user_id)?.name || "Usuario",
        avatarUrl: profileMap.get(row.user_id)?.avatarUrl ?? null,
        message: row.request_message ?? null,
      })),
    );
  }, [user]);

  const respondToRequest = async (requestId: number, status: "accepted" | "blocked") => {
    if (respondingRequestId !== null) return;
    setRespondingRequestId(requestId);
    setRequestsError(null);
    try {
      const { error } = await supabase.from("friendships").update({ status }).eq("id", requestId).eq("friend_id", user?.id ?? "");
      if (error) {
        setRequestsError("No se pudo actualizar la solicitud. Inténtalo de nuevo.");
        return;
      }
      setPendingRequests((current) => current.filter((request) => request.id !== requestId));
      void fetchFriends();
    } finally {
      setRespondingRequestId(null);
    }
  };

  const fetchFriends = useCallback(async () => {
    if (!user) {
      setFriends([]);
      setIsLoading(false);
      return;
    }
    try {
      if (!hasLoadedFriendsOnce.current) setIsLoading(true);
      setLoadError(null);
      const { data: friendships, error: friendshipsError } = await supabase
        .from("friendships")
        .select("id, user_id, friend_id, status, request_message")
        .eq("status", "accepted")
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);
      if (friendshipsError) throw friendshipsError;

      const friendIds = ((friendships ?? []) as FriendshipRow[]).map((row) =>
        row.user_id === user.id ? row.friend_id : row.user_id,
      );
      if (friendIds.length === 0) {
        setFriends([]);
        return;
      }

      const [{ data: profiles, error: profilesError }, { data: checkins, error: checkinsError }, { data: stories }, { data: viewedStories }] =
        await Promise.all([
          supabase.rpc("get_visible_profiles", { p_ids: friendIds }),
          supabase
            .from("checkins")
            .select("user_id, created_at, venues(name)")
            .in("user_id", friendIds)
            .eq("status", "active")
            .order("created_at", { ascending: false }),
          supabase.from("stories").select("id, user_id").in("user_id", friendIds).gt("expires_at", new Date().toISOString()),
          supabase.from("story_views").select("story_id").eq("viewer_id", user.id),
        ]);
      if (profilesError) throw profilesError;
      if (checkinsError) throw checkinsError;

      const checkinByUser = new Map<string, CheckinRow>();
      const storyRows = (stories ?? []) as StoryRow[];
      const viewedStoryIds = new Set(((viewedStories ?? []) as { story_id: number }[]).map((row) => row.story_id));
      const storyUserIds = new Set(storyRows.map((story) => story.user_id));
      const unseenStoryUserIds = new Set(
        storyRows.filter((story) => !viewedStoryIds.has(story.id)).map((story) => story.user_id),
      );
      for (const checkin of (checkins ?? []) as CheckinRow[]) {
        if (!checkinByUser.has(checkin.user_id)) checkinByUser.set(checkin.user_id, checkin);
      }

      setFriends(
        ((profiles ?? []) as ProfileRow[])
          .map((profile) => {
            const name = getDisplayName(profile);
            const checkin = checkinByUser.get(profile.id);
            return {
              id: profile.id,
              name,
              status: checkin ? "in_bar" : "offline",
              bar: checkin?.venues?.name ?? undefined,
              checkInTime: checkin ? formatDate(checkin.created_at) : undefined,
              avatar: getInitials(name),
              avatarUrl: profile.avatar_url ?? null,
              hasActiveStory: unseenStoryUserIds.has(profile.id),
              hasStory: storyUserIds.has(profile.id),
            } satisfies Friend;
          })
          .filter((friend) => friend.name.length > 0),
      );
    } catch (error) {
      console.error("Error loading friends:", error);
      setLoadError("No se pudieron actualizar tus amigos. Conservamos la información anterior; inténtalo de nuevo.");
    } finally {
      hasLoadedFriendsOnce.current = true;
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void fetchFriends();
    void fetchPendingRequests();
    const channel = supabase
      .channel("sky-night-friends-checkins")
      .on("postgres_changes", { event: "*", schema: "public", table: "checkins" }, () => void fetchFriends())
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => {
        void fetchFriends();
        void fetchPendingRequests();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "stories" }, () => void fetchFriends())
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "story_views", filter: `viewer_id=eq.${user?.id ?? ""}` },
        () => void fetchFriends(),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => void fetchFriends())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchFriends, fetchPendingRequests, revision, user?.id]);

  const filteredFriends = useMemo(
    () => friends.filter((friend) => friend.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [friends, searchQuery],
  );

  const searchPublicProfiles = useCallback(async () => {
    const query = searchQuery.trim();
    if (!user || query.length < 2) {
      setPublicSearchResults([]);
      return;
    }
    setIsSearchingPublic(true);
    const { data, error } = await supabase.rpc("search_public_profiles", { p_query: query });
    if (!error) setPublicSearchResults((data ?? []) as PublicSearchProfile[]);
    else setPublicSearchResults([]);
    setIsSearchingPublic(false);
  }, [searchQuery, user]);

  useEffect(() => {
    const timer = setTimeout(() => void searchPublicProfiles(), 280);
    return () => clearTimeout(timer);
  }, [searchPublicProfiles]);

  const friendsInBars = friends.filter((friend) => friend.status === "in_bar").length;

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try { await Promise.all([fetchFriends(), fetchPendingRequests()]); } finally { setIsRefreshing(false); }
  }, [fetchFriends, fetchPendingRequests]);

  const renderFriendCard = ({ item: friend }: { item: Friend }) => {
    const isInBar = friend.status === "in_bar";
    const openFriendStory = () => {
      if (!friend.hasStory) return;
      setFriends((current) =>
        current.map((entry) => (entry.id === friend.id ? { ...entry, hasActiveStory: false } : entry)),
      );
      router.push(`/(tabs)/stories?userId=${friend.id}`);
    };
    return (
      <Pressable onPress={() => router.push(`/profile/${friend.id}`)} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
        <View
          className="p-3 rounded-2xl mb-2 flex-row items-center gap-3 border"
          style={{ backgroundColor: colors.surface, borderColor: colors.border }}
        >
          <TouchableOpacity
            activeOpacity={friend.hasStory ? 0.8 : 1}
            disabled={!friend.hasStory}
            onPress={openFriendStory}
            style={{
              width: 70,
              height: 70,
              borderRadius: 35,
              borderWidth: 3,
              borderColor: friend.hasStory
                ? friend.hasActiveStory
                  ? colors.success
                  : colors.border
                : "transparent",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View
              style={{
                width: 60,
                height: 60,
                borderRadius: 30,
                overflow: "hidden",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: `${colors.primary}22`,
              }}
            >
              {friend.avatarUrl ? (
                <ExpoImage
                  source={{ uri: friend.avatarUrl }}
                  style={{ width: 60, height: 60, borderRadius: 30 }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
              ) : (
                <Text className="text-xl font-bold" style={{ color: colors.primary }}>
                  {friend.avatar}
                </Text>
              )}
            </View>
          </TouchableOpacity>
          <View className="flex-1">
            <View className="mb-1 flex-row items-center gap-2">
              <Text className="text-lg font-semibold text-foreground">{friend.name}</Text>
              {isInBar ? (
                <View
                  className="flex-row items-center gap-1 rounded-full px-2 py-1"
                  style={{ backgroundColor: `${colors.success}18` }}
                >
                  <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colors.success }} />
                  <Text className="text-[10px] font-bold" style={{ color: colors.success }}>
                    Brindis activo
                  </Text>
                </View>
              ) : null}
            </View>
            {isInBar ? (
              <>
                <Text className="mb-1 text-sm font-medium text-foreground">Está tomando algo</Text>
                <Text className="text-xs text-muted">Activo desde {friend.checkInTime}</Text>
              </>
            ) : (
              <Text className="text-sm text-muted">Sin brindis activo</Text>
            )}
          </View>
          {isInBar ? <IconSymbol name="chevron.right" size={20} color={colors.primary} /> : null}
        </View>
      </Pressable>
    );
  };

  return (
    <ScreenContainer className="p-6">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <View className="flex-1">
          <View className="mb-6">
            <Text className="mb-2 text-3xl font-bold text-foreground">Amigos</Text>
            <Text className="text-sm text-muted">
              {friendsInBars > 0 ? `${friendsInBars} amigos en bares` : "Todavía no tienes amigos en bares"}
            </Text>
            <Pressable
              onPress={() => setIsQrVisible(true)}
              accessibilityLabel="Conectar con QR"
              style={({ pressed }) => ({
                marginTop: 14,
                minHeight: 52,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                borderRadius: 16,
                backgroundColor: colors.primary,
                opacity: pressed ? 0.84 : 1,
              })}
            >
              <IconSymbol name="qrcode" size={21} color={colors.background} />
              <Text className="text-sm font-bold text-background">Conectar con QR</Text>
            </Pressable>
          </View>

          <View className="mb-4 flex-row rounded-xl border p-1" style={{ borderColor: colors.border, backgroundColor: colors.surface }}>
            {(["friends", "requests"] as const).map((section) => (
              <Pressable
                key={section}
                onPress={() => setFriendsSection(section)}
                accessibilityRole="tab"
                accessibilityState={{ selected: friendsSection === section }}
                accessibilityLabel={section === "friends" ? "Ver mis amigos" : `Ver solicitudes${pendingRequests.length ? `, ${pendingRequests.length} pendientes` : ""}`}
                style={{ flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 9, paddingVertical: 10, backgroundColor: friendsSection === section ? colors.primary : "transparent" }}
              >
                <Text style={{ color: friendsSection === section ? colors.background : colors.foreground, fontWeight: "700" }}>
                  {section === "friends" ? "Mis amigos" : `Solicitudes${pendingRequests.length ? ` (${pendingRequests.length})` : ""}`}
                </Text>
              </Pressable>
            ))}
          </View>

          {friendsSection === "requests" ? (
            <View className="mb-5 rounded-2xl border p-4" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
              <View className="flex-row items-center justify-between">
                <View>
                  <Text className="text-base font-bold text-foreground">Solicitudes para conectar</Text>
                  <Text className="mt-1 text-xs text-muted">Responde cuando estés listo</Text>
                </View>
                {pendingRequests.length ? (
                  <View className="rounded-full px-3 py-1" style={{ backgroundColor: `${colors.primary}20` }}>
                    <Text className="text-xs font-bold" style={{ color: colors.primary }}>{pendingRequests.length}</Text>
                  </View>
                ) : null}
              </View>
              {requestsError ? (
                <View className="mt-3 rounded-xl border p-3" style={{ borderColor: `${colors.error}66`, backgroundColor: `${colors.error}12` }}>
                  <Text className="text-sm text-foreground">{requestsError}</Text>
                  <Pressable onPress={() => void fetchPendingRequests()} accessibilityRole="button" accessibilityLabel="Reintentar cargar solicitudes" style={{ minHeight: 44, justifyContent: "center" }}>
                    <Text className="font-bold" style={{ color: colors.primary }}>Reintentar</Text>
                  </Pressable>
                </View>
              ) : null}
              {pendingRequests.length === 0 && !requestsError ? <Text className="mt-4 text-sm text-muted">No tienes solicitudes pendientes.</Text> : null}
              {pendingRequests.map((request) => (
                <View
                  key={request.id}
                  className="mt-4 rounded-2xl border p-4"
                  style={{ borderColor: colors.border, backgroundColor: colors.background }}
                >
                  <Pressable
                    onPress={() => router.push(`/profile/${request.senderId}`)}
                    className="flex-row items-center gap-3"
                  >
                    <View className="h-12 w-12 items-center justify-center overflow-hidden rounded-full" style={{ backgroundColor: `${colors.primary}22` }}>
                      {request.avatarUrl ? (
                        <ExpoImage source={{ uri: request.avatarUrl }} style={{ width: 48, height: 48 }} contentFit="cover" />
                      ) : (
                        <Text className="text-lg font-bold" style={{ color: colors.primary }}>{getInitials(request.name)}</Text>
                      )}
                    </View>
                    <View className="flex-1">
                      <Text className="font-semibold text-foreground">{request.name}</Text>
                      <Text className="mt-1 text-xs text-muted">Toca para ver su perfil</Text>
                    </View>
                  </Pressable>
                  {request.message ? (
                    <Text className="mt-1 text-sm leading-5 text-muted">“{request.message}”</Text>
                  ) : null}
                  <View className="mt-4 flex-row gap-3">
                    <Pressable
                      disabled={respondingRequestId === request.id}
                      onPress={() => void respondToRequest(request.id, "accepted")}
                      style={({ pressed }) => ({
                        flex: 1,
                        minHeight: 48,
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 10,
                        backgroundColor: colors.primary,
                        paddingVertical: 10,
                        opacity: respondingRequestId === request.id ? 0.55 : pressed ? 0.8 : 1,
                      })}
                    >
                      {respondingRequestId === request.id ? <ActivityIndicator color={colors.background} /> : <Text className="text-sm font-bold text-background">Aceptar</Text>}
                    </Pressable>
                    <Pressable
                      disabled={respondingRequestId === request.id}
                      onPress={() => void respondToRequest(request.id, "blocked")}
                      style={({ pressed }) => ({
                        flex: 1,
                        minHeight: 48,
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: colors.border,
                        paddingVertical: 10,
                        opacity: respondingRequestId === request.id ? 0.55 : pressed ? 0.7 : 1,
                      })}
                    >
                      <Text className="text-sm font-semibold text-foreground">Rechazar</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          <View
            className="mb-3 flex-row items-center gap-3 rounded-xl border px-4 py-3"
            style={{ backgroundColor: colors.surface, borderColor: colors.border }}
          >
            <IconSymbol name="magnifyingglass" size={18} color={colors.muted} />
            <TextInput
              placeholder="Buscar por nombre, usuario o correo"
              placeholderTextColor={colors.muted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
              className="flex-1 text-foreground"
              style={{ color: colors.foreground }}
            />
          </View>

          {searchQuery.trim().length >= 2 ? (
            <View className="mb-5 rounded-2xl border p-3" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
              <Text className="px-1 text-xs font-bold uppercase tracking-wider text-muted">Perfiles públicos</Text>
              {isSearchingPublic ? <ActivityIndicator className="mt-3" color={colors.primary} /> : null}
              {!isSearchingPublic && publicSearchResults.length === 0 ? (
                <Text className="mt-3 px-1 text-sm text-muted">No encontramos perfiles públicos con esa búsqueda.</Text>
              ) : null}
              {publicSearchResults.map((profile) => {
                const display = getDisplayName({ id: profile.id, name: profile.name, email: profile.username });
                return (
                  <Pressable
                    key={profile.id}
                    onPress={() => router.push(`/profile/${profile.id}`)}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      marginTop: 10,
                      padding: 10,
                      borderRadius: 14,
                      backgroundColor: colors.background,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <View
                      className="h-10 w-10 items-center justify-center rounded-full"
                      style={{ backgroundColor: `${colors.primary}22` }}
                    >
                      <Text className="font-bold" style={{ color: colors.primary }}>
                        {getInitials(display)}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text className="font-semibold text-foreground">{display}</Text>
                      {profile.username ? <Text className="text-xs text-muted">@{profile.username}</Text> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

           <View className="mb-4">
             <Pressable
               disabled={isLoadingNearby}
               onPress={() => void fetchNearbyProfiles()}
              accessibilityRole="button"
              accessibilityLabel="Buscar personas cercanas"
              style={({ pressed }) => ({
                minHeight: 48,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                paddingVertical: 12,
                 opacity: isLoadingNearby ? 0.55 : pressed ? 0.8 : 1,
               })}
             >
               {isLoadingNearby ? <ActivityIndicator color={colors.primary} /> : <Text className="text-sm font-semibold text-foreground">Ver personas cercanas</Text>}
            </Pressable>
          </View>

          {isLoadingNearby ? <ActivityIndicator color={colors.primary} /> : null}
          {nearbyError ? <Text className="mb-2 text-xs text-muted">{nearbyError}</Text> : null}
          {nearbyProfiles.length > 0 ? (
            <View className="mb-4">
              <Text className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Cerca de ti</Text>
              {nearbyProfiles.slice(0, 8).map((profile) => (
                <Pressable
                  key={profile.id}
                  onPress={() => router.push(`/profile/${profile.id}`)}
                  className="mb-2 flex-row items-center gap-3 rounded-xl border p-3"
                  style={{ borderColor: colors.border, backgroundColor: colors.surface }}
                >
                  <Text className="flex-1 font-semibold text-foreground">{profile.name ?? "Usuario"}</Text>
                  <Text className="text-xs text-muted">{profile.distance_km.toFixed(1)} km</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {loadError ? <View className="mb-3 rounded-xl border p-3" style={{ borderColor: `${colors.error}66`, backgroundColor: `${colors.error}12` }}><Text className="text-sm text-foreground">{loadError}</Text><Pressable onPress={() => void handleRefresh()} accessibilityRole="button" accessibilityLabel="Reintentar cargar amigos" style={{ minHeight: 44, justifyContent: "center" }}><Text className="font-bold" style={{ color: colors.primary }}>Reintentar</Text></Pressable></View> : null}
          {isLoading ? (
            <View accessibilityLabel="Cargando amigos" className="gap-2"><View className="h-16 rounded-2xl" style={{ backgroundColor: `${colors.border}55` }} /><View className="h-16 rounded-2xl" style={{ backgroundColor: `${colors.border}55` }} /><View className="h-16 rounded-2xl" style={{ backgroundColor: `${colors.border}55` }} /></View>
          ) : (
            <FlatList
              data={filteredFriends}
              refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void handleRefresh()} tintColor={colors.primary} colors={[colors.primary]} />}
              keyExtractor={(item) => item.id}
              renderItem={renderFriendCard}
              ListEmptyComponent={<Text className="text-muted">Aún no tienes amigos conectados.</Text>}
              contentContainerStyle={{ paddingBottom: 40 }}
            />
          )}
        </View>

        <Modal visible={isQrVisible} transparent animationType="slide" onRequestClose={() => setIsQrVisible(false)}>
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 24 }}>
            <View style={{ backgroundColor: colors.surface, borderRadius: 24, padding: 22 }}>
              <View className="mb-2 flex-row items-center justify-between">
                <View>
                  <Text className="text-xl font-bold text-foreground">Conectar con QR</Text>
              <Text className="mt-1 text-sm text-muted">Escanea un código o comparte el tuyo</Text>
                </View>
                <Pressable onPress={() => setIsQrVisible(false)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Cerrar código QR" style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}>
                  <Text className="text-lg font-bold text-muted">×</Text>
                </Pressable>
              </View>
              <Pressable
                onPress={() => { setIsQrVisible(false); router.push("/scan-qr"); }}
                style={({ pressed }) => ({ marginTop: 18, minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: colors.primary, opacity: pressed ? 0.82 : 1 })}
              >
                <Text className="font-bold text-background">Escanear QR</Text>
              </Pressable>
              <View className="mt-5 items-center rounded-2xl p-4" style={{ backgroundColor: colors.background }}>
                <Text className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">Mi código personal</Text>
                {user?.id ? <QRCode value={`socialsip://profile/${user.id}`} size={170} /> : null}
              </View>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
