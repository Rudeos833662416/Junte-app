import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { SecureMediaViewer } from "@/components/secure-media-viewer";
import { ThoughtBubble } from "@/components/thought-bubble";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Image as ExpoImage } from "expo-image";

type PublicProfile = {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  bio: string | null;
};

type Friendship = { user_id: string; friend_id: string; status: string };

function displayName(profile: PublicProfile) {
  return profile.name?.trim() || profile.email?.split("@")[0]?.trim() || "Usuario de Tragos Sociales";
}

export default function PublicProfileScreen() {
  const colors = useColors();
  const { user } = useAuth({ autoFetch: true });
  const { id } = useLocalSearchParams<{ id: string }>();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [friendship, setFriendship] = useState<Friendship | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [requestMessage, setRequestMessage] = useState("");
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const hasLoadedProfileOnce = useRef(false);

  const loadProfile = useCallback(async () => {
    if (!id) return;
    try {
      if (!hasLoadedProfileOnce.current) setIsLoading(true);
      const { data: visibleProfiles, error } = await supabase.rpc("get_visible_profiles", { p_ids: [id] });
      if (error) throw error;
      const row = ((visibleProfiles ?? []) as (PublicProfile & { bio?: string | null })[])[0] ?? null;
      setProfile(row ? { ...row, bio: row.bio ?? null } : null);

      if (user && user.id !== id) {
        const { data: friendshipRows } = await supabase
          .from("friendships")
          .select("user_id, friend_id, status")
          .or(`and(user_id.eq.${user.id},friend_id.eq.${id}),and(user_id.eq.${id},friend_id.eq.${user.id})`)
          .limit(1);
        setFriendship((friendshipRows?.[0] as Friendship | undefined) ?? null);
        const { count } = await supabase
          .from("direct_messages")
          .select("id", { count: "exact", head: true })
          .eq("sender_id", id)
          .eq("recipient_id", user.id)
          .is("read_at", null);
        setUnreadMessages(count ?? 0);
      }
    } catch (error) {
      Alert.alert("No se pudo abrir el perfil", error instanceof Error ? error.message : "Inténtalo de nuevo.");
    } finally {
      hasLoadedProfileOnce.current = true;
      setIsLoading(false);
    }
  }, [id, user]);

  useFocusEffect(
    useCallback(() => {
      void loadProfile();
      return undefined;
    }, [loadProfile]),
  );

  useEffect(() => {
    if (!user || !id || user.id === id) return;
    const channel = supabase.channel(`profile-unread-${user.id}-${id}`);
    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "direct_messages", filter: `recipient_id=eq.${user.id}` },
      (payload) => {
        if ((payload.new as { sender_id?: string }).sender_id === id) setUnreadMessages((count) => count + 1);
      },
    );
    channel.on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `id=eq.${id}` }, () =>
      void loadProfile(),
    );
    channel.on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => void loadProfile());
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, user, loadProfile]);

  const markAsRead = useCallback(
    async (friendId: string) => {
      if (!user) return;
      const { error } = await supabase
        .from("direct_messages")
        .update({ read_at: new Date().toISOString() })
        .eq("sender_id", friendId)
        .eq("recipient_id", user.id)
        .is("read_at", null);
      if (!error) setUnreadMessages(0);
    },
    [user],
  );

  const sendFriendRequest = async () => {
    if (!user || !profile || user.id === profile.id || isSending) return;
    try {
      setIsSending(true);
      const { data, error } = await supabase
        .from("friendships")
        .insert({
          user_id: user.id,
          friend_id: profile.id,
          status: "pending",
          request_message: requestMessage.trim() || null,
        })
        .select("user_id, friend_id, status")
        .single();
      if (error) throw error;
      setFriendship(data as Friendship);
      Alert.alert("Solicitud enviada", `Tu solicitud para conectar con ${displayName(profile)} quedó pendiente.`);
    } catch (error) {
      Alert.alert(
        "No se pudo enviar",
        error instanceof Error ? error.message : "Es posible que ya exista una solicitud.",
      );
    } finally {
      setIsSending(false);
    }
  };

  if (isLoading) {
    return (
      <ScreenContainer className="items-center justify-center p-6">
        <ActivityIndicator color={colors.primary} />
        <Text className="mt-3 text-sm text-muted">Cargando perfil…</Text>
      </ScreenContainer>
    );
  }

  if (!profile) {
    return (
      <ScreenContainer className="items-center justify-center p-6">
        <Text className="text-xl font-bold text-foreground">Perfil no disponible</Text>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => ({
            marginTop: 18,
            padding: 14,
            borderRadius: 14,
            backgroundColor: colors.primary,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text className="font-bold text-background">Volver</Text>
        </Pressable>
      </ScreenContainer>
    );
  }

  const name = displayName(profile);
  const isSelf = user?.id === profile.id;
  const isAccepted = friendship?.status === "accepted";
  const isPending = friendship?.status === "pending";

  return (
    <ScreenContainer className="p-5">
      <ScrollView contentContainerStyle={{ paddingBottom: 36 }} showsVerticalScrollIndicator={false}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => ({ alignSelf: "flex-start", paddingVertical: 8, opacity: pressed ? 0.55 : 1 })}
        >
          <Text className="font-semibold" style={{ color: colors.primary }}>
            ‹ Volver
          </Text>
        </Pressable>
        <View
          className="mt-2 overflow-hidden rounded-3xl border"
          style={{ backgroundColor: colors.surface, borderColor: colors.border }}
        >
          {profile.cover_url ? (
            <Pressable
              onPress={() => {
                if (isSelf) {
                  router.replace("/(tabs)/profile");
                  return;
                }
                setViewerUri(profile.cover_url);
              }}
            >
              <ExpoImage
                source={{ uri: profile.cover_url }}
                style={{ width: "100%", height: 160 }}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            </Pressable>
          ) : (
            <View className="h-40" style={{ backgroundColor: `${colors.primary}20` }} />
          )}
          <View className="items-center px-5 pb-6">
            <Pressable
              onPress={() => {
                if (isSelf) {
                  router.replace("/(tabs)/profile");
                  return;
                }
                if (profile.avatar_url) setViewerUri(profile.avatar_url);
              }}
              style={{ marginTop: -44 }}
            >
              <View
                className="h-24 w-24 items-center justify-center overflow-hidden rounded-full border-4"
                style={{ borderColor: colors.surface, backgroundColor: colors.primary }}
              >
                {profile.avatar_url ? (
                  <ExpoImage
                    source={{ uri: profile.avatar_url }}
                    style={{ width: "100%", height: "100%" }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                ) : (
                  <Text className="text-3xl font-bold" style={{ color: colors.background }}>
                    {name[0]?.toUpperCase() ?? "?"}
                  </Text>
                )}
              </View>
            </Pressable>
            {profile.bio ? (
              <View
                pointerEvents="box-none"
                style={{
                  position: "absolute",
                  top: 28,
                  left: "50%",
                  marginLeft: 28,
                  zIndex: 8,
                  maxWidth: 200,
                }}
              >
                <ThoughtBubble text={profile.bio} editable={false} floating />
              </View>
            ) : null}
            <Text className="mt-3 text-2xl font-bold text-foreground">{name}</Text>
            <Text className="mt-1 text-sm text-muted">Perfil de Tragos Sociales</Text>
            {!isSelf ? (
              <>
                {!isAccepted && !isPending ? (
                  <TextInput
                    value={requestMessage}
                    onChangeText={setRequestMessage}
                    placeholder="Escribe un saludo (opcional)"
                    placeholderTextColor={colors.muted}
                    maxLength={140}
                    className="mt-4 w-full rounded-xl border bg-background px-3 py-3 text-center text-foreground"
                    style={{ borderColor: colors.border }}
                  />
                ) : null}
                <Pressable
                  disabled={isSending || isAccepted || isPending}
                  onPress={() => void sendFriendRequest()}
                  style={({ pressed }) => ({
                    marginTop: 18,
                    minHeight: 48,
                    minWidth: 220,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 15,
                    backgroundColor: isAccepted || isPending ? colors.surface : colors.primary,
                    borderWidth: isAccepted || isPending ? 1 : 0,
                    borderColor: colors.border,
                    opacity: isSending ? 0.55 : pressed ? 0.82 : 1,
                  })}
                >
                  <Text
                    className="font-bold"
                    style={{ color: isAccepted || isPending ? colors.foreground : colors.background }}
                  >
                    {isAccepted
                      ? "Ya son amigos"
                      : isPending
                        ? "Solicitud pendiente"
                        : isSending
                          ? "Enviando…"
                          : "Enviar solicitud"}
                  </Text>
                </Pressable>
                {isAccepted ? (
                  <View style={{ position: "relative", alignSelf: "center" }}>
                    <Pressable
                      onPress={() => {
                        void markAsRead(profile.id);
                        router.push(`/chat/${profile.id}`);
                      }}
                      style={({ pressed }) => ({
                        marginTop: 10,
                        minHeight: 48,
                        minWidth: 220,
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 15,
                        borderWidth: 1,
                        borderColor: colors.primary,
                        backgroundColor: `${colors.primary}12`,
                        opacity: pressed ? 0.75 : 1,
                      })}
                    >
                      <View className="flex-row items-center gap-2">
                        <IconSymbol name="message.fill" size={18} color={colors.primary} />
                        <Text className="font-bold" style={{ color: colors.primary }}>
                          Chat
                        </Text>
                      </View>
                    </Pressable>
                    {unreadMessages > 0 ? (
                      <View
                        style={{
                          position: "absolute",
                          right: -5,
                          top: 3,
                          minWidth: 22,
                          height: 22,
                          paddingHorizontal: 5,
                          borderRadius: 11,
                          backgroundColor: colors.success,
                          alignItems: "center",
                          justifyContent: "center",
                          borderWidth: 2,
                          borderColor: colors.surface,
                        }}
                      >
                        <Text style={{ color: colors.background, fontSize: 11, fontWeight: "800" }}>
                          {unreadMessages > 99 ? "99+" : unreadMessages}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </>
            ) : null}
          </View>
        </View>
        <View
          className="mt-5 rounded-2xl border p-4"
          style={{ backgroundColor: colors.surface, borderColor: colors.border }}
        >
          <View className="flex-row items-center gap-3">
            <IconSymbol name="person.fill" size={20} color={colors.primary} />
            <Text className="flex-1 text-sm leading-5 text-muted">
              Conecta cara a cara escaneando un código QR. Solo tú decides cuándo aceptar solicitudes.
            </Text>
          </View>
        </View>
      </ScrollView>
      <SecureMediaViewer uri={viewerUri} onClose={() => setViewerUri(null)} secure />
    </ScreenContainer>
  );
}
