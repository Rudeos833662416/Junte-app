import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { supabase } from "@/lib/supabase";
import { getCachedConversation, mergeCachedMessage, setCachedConversation } from "@/lib/chat-store";
import { Image } from "expo-image";
import { setActiveChatId } from "@/lib/push-notifications";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Message = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
  client_message_id?: string | null;
  pending?: boolean;
};

function newClientMessageId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function ChatScreen() {
  const colors = useColors();
  const { user } = useAuth({ autoFetch: true });
  const { id: otherIdParam, name: routeName, avatarUrl: routeAvatar } = useLocalSearchParams<{ id: string; name?: string; avatarUrl?: string }>();
  const otherId = Array.isArray(otherIdParam) ? otherIdParam[0] : otherIdParam;
  const initialName = Array.isArray(routeName) ? routeName[0] : routeName;
  const initialAvatar = Array.isArray(routeAvatar) ? routeAvatar[0] : routeAvatar;
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>(() => otherId ? getCachedConversation(otherId) as Message[] : []);
  const [draft, setDraft] = useState("");
  const [otherName, setOtherName] = useState(initialName || "Chat");
  const [otherAvatar, setOtherAvatar] = useState<string | null>(initialAvatar || null);
  const [loading, setLoading] = useState(() => !otherId || getCachedConversation(otherId).length === 0);
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const markAsRead = useCallback(
    async (friendId: string) => {
      if (!user) return;
      const readAt = new Date().toISOString();
      const { error } = await supabase
        .from("direct_messages")
        .update({ read_at: readAt })
        .eq("sender_id", friendId)
        .eq("recipient_id", user.id)
        .is("read_at", null);
      if (error) {
        console.warn("Could not mark messages as read:", error.message);
        return;
      }
      setMessages((current) => {
        const next = current.map((message) =>
          message.sender_id === friendId && !message.read_at
            ? { ...message, read_at: readAt }
            : message,
        );
        if (otherId) setCachedConversation(otherId, next);
        return next;
      });
    },
    [otherId, user],
  );

  const loadMessages = useCallback(async () => {
    if (!user || !otherId) return;
    if (getCachedConversation(otherId).length === 0) setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from("direct_messages")
        .select("id, sender_id, recipient_id, body, created_at, read_at, client_message_id")
        .or(
          `and(sender_id.eq.${user.id},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${user.id})`,
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      const confirmed = (data ?? []) as Message[];
      setMessages((current) => {
        const confirmedIds = new Set(confirmed.map((message) => message.client_message_id).filter(Boolean));
        const pending = current.filter((message) => message.pending && !confirmedIds.has(message.client_message_id));
        const next = [...confirmed, ...pending].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
        setCachedConversation(otherId, next);
        return next;
      });
      await markAsRead(otherId);
      const profile = await supabase
        .from("public_profiles")
        .select("name, avatar_url")
        .eq("id", otherId)
        .maybeSingle();
      setOtherName(profile.data?.name?.trim() || initialName || "Chat");
      setOtherAvatar(profile.data?.avatar_url || initialAvatar || null);
    } catch (error) {
      console.warn("Chat load failed:", error);
      setLoadError("No se pudo actualizar la conversación. Conservamos los mensajes anteriores; inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }, [initialAvatar, initialName, markAsRead, otherId, user]);

  useFocusEffect(
    useCallback(() => {
      setActiveChatId(otherId ?? null);
      void loadMessages();
      return () => setActiveChatId(null);
    }, [loadMessages, otherId]),
  );

  useEffect(() => {
    if (!user || !otherId) return;
    const channel = supabase.channel(`direct-messages-${user.id}-${otherId}`);

    const upsertRow = (row: Message) => {
      setMessages((current) => {
        const next = mergeCachedMessage(current, { ...row, pending: false });
        setCachedConversation(otherId, next);
        return next as Message[];
      });
      if (row.sender_id === otherId) void markAsRead(otherId);
    };

    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "direct_messages",
        filter: `recipient_id=eq.${user.id}`,
      },
      (payload) => {
        const row = payload.new as Message;
        if (row.sender_id === otherId) upsertRow(row);
      },
    );
    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "direct_messages",
        filter: `sender_id=eq.${user.id}`,
      },
      (payload) => {
        const row = payload.new as Message;
        if (row.recipient_id === otherId) upsertRow(row);
      },
    );
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [markAsRead, otherId, user]);

  const sendMessage = async () => {
    const body = draft.trim();
    if (!user || !otherId || !body || sending) return;

    const clientMessageId = newClientMessageId();
    const optimistic: Message = {
      id: `local-${clientMessageId}`,
      sender_id: user.id,
      recipient_id: otherId,
      body,
      created_at: new Date().toISOString(),
      read_at: null,
      client_message_id: clientMessageId,
      pending: true,
    };

    setDraft("");
    setSending(true);
    setMessages((current) => {
      const next = [optimistic, ...current];
      setCachedConversation(otherId, next);
      return next;
    });

    const { data, error } = await supabase
      .from("direct_messages")
      .insert({
        sender_id: user.id,
        recipient_id: otherId,
        body,
        client_message_id: clientMessageId,
      })
      .select("id, sender_id, recipient_id, body, created_at, read_at, client_message_id")
      .single();

    setSending(false);

    if (error) {
      if (error.code === "23505") {
        void loadMessages();
        return;
      }
      setMessages((current) => {
        const next = current.filter((item) => item.client_message_id !== clientMessageId);
        setCachedConversation(otherId, next);
        return next;
      });
      setDraft(body);
      Alert.alert("No se pudo enviar", "El mensaje quedó sin enviar. Comprueba tu conexión e inténtalo de nuevo.");
      return;
    }

    if (data) {
      setMessages((current) => {
        const next = mergeCachedMessage(current, { ...(data as Message), pending: false });
        setCachedConversation(otherId, next);
        return next as Message[];
      });
    }
  };

  return (
    <ScreenContainer className="p-5">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <View className="mb-4 flex-row items-center gap-3">
          <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Volver">
            <Text className="text-2xl" style={{ color: colors.primary }}>
              ‹
            </Text>
          </Pressable>
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: colors.border,
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            {otherAvatar ? (
              <Image
                source={{ uri: otherAvatar }}
                style={{ width: 36, height: 36 }}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={0}
                recyclingKey={otherId}
              />
            ) : (
              <Text className="text-xs font-bold text-foreground">
                {(otherName || "?").slice(0, 1).toUpperCase()}
              </Text>
            )}
          </View>
          <Text className="min-w-0 flex-1 text-lg font-semibold text-foreground" numberOfLines={1}>
            {otherName}
          </Text>
        </View>
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <>
          {loadError ? <View className="mb-3 rounded-xl border p-3" style={{ borderColor: `${colors.error}66`, backgroundColor: `${colors.error}12` }}><Text className="text-sm text-foreground">{loadError}</Text><Pressable onPress={() => void loadMessages()} accessibilityRole="button" accessibilityLabel="Reintentar actualizar conversación" style={{ minHeight: 44, justifyContent: "center" }}><Text className="font-bold" style={{ color: colors.primary }}>Reintentar</Text></Pressable></View> : null}
          <FlatList
            data={messages}
            inverted
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 2, paddingTop: 12, flexGrow: 1 }}
            ListEmptyComponent={
              <View className="flex-1 items-center justify-center py-16">
                <Text className="text-sm text-muted">Escribe el primer mensaje</Text>
              </View>
            }
            renderItem={({ item }) => {
              const mine = item.sender_id === user?.id;
              return (
                <View
                  style={{
                    alignSelf: mine ? "flex-end" : "flex-start",
                    maxWidth: "82%",
                    marginBottom: 8,
                    borderRadius: 16,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    backgroundColor: mine ? colors.primary : colors.surface,
                    opacity: item.pending ? 0.65 : 1,
                  }}
                >
                  <Text style={{ color: mine ? colors.background : colors.foreground }}>{item.body}</Text>
                  <Text
                    style={{
                      marginTop: 4,
                      fontSize: 10,
                      color: mine ? `${colors.background}CC` : colors.muted,
                    }}
                  >
                    {new Date(item.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {mine && item.read_at ? " · leído" : mine && item.pending ? " · enviando…" : ""}
                  </Text>
                </View>
              );
            }}
          />
          </>
        )}

        <View style={{ paddingBottom: Math.max(insets.bottom, 8), paddingTop: 8 }} className="flex-row items-end gap-2">
          <TextInput
            accessibilityLabel="Mensaje"
            accessibilityHint="Escribe un mensaje para enviarlo a tu contacto"
            value={draft}
            onChangeText={setDraft}
            placeholder="Mensaje…"
            placeholderTextColor={colors.muted}
            multiline
            maxLength={2000}
            style={{
              flex: 1,
              minHeight: 44,
              maxHeight: 120,
              borderWidth: 1,
              borderRadius: 18,
              borderColor: colors.border,
              color: colors.foreground,
              backgroundColor: colors.surface,
              paddingHorizontal: 14,
              paddingVertical: 12,
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Enviar mensaje"
            onPress={() => void sendMessage()}
            disabled={sending || !draft.trim()}
            style={({ pressed }) => ({
              borderRadius: 18,
              backgroundColor: colors.primary,
              paddingHorizontal: 16,
              paddingVertical: 13,
              opacity: pressed || sending || !draft.trim() ? 0.55 : 1,
            })}
          >
            <Text className="font-bold text-background">Enviar</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
