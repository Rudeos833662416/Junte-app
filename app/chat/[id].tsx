import { useCallback, useEffect, useRef, useState } from "react";
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
  const { id: otherId } = useLocalSearchParams<{ id: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [otherName, setOtherName] = useState("Chat");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);

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
      setMessages((current) =>
        current.map((message) =>
          message.sender_id === friendId && !message.read_at
            ? { ...message, read_at: readAt }
            : message,
        ),
      );
    },
    [user],
  );

  const loadMessages = useCallback(async () => {
    if (!user || !otherId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("direct_messages")
        .select("id, sender_id, recipient_id, body, created_at, read_at, client_message_id")
        .or(
          `and(sender_id.eq.${user.id},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${user.id})`,
        )
        .order("created_at", { ascending: true });
      if (error) throw error;
      setMessages((data ?? []) as Message[]);
      await markAsRead(otherId);
      const profile = await supabase
        .from("public_profiles")
        .select("name")
        .eq("id", otherId)
        .maybeSingle();
      setOtherName(profile.data?.name?.trim() || "Chat");
    } catch (error) {
      console.warn("Chat load failed:", error);
    } finally {
      setLoading(false);
    }
  }, [markAsRead, otherId, user]);

  useFocusEffect(
    useCallback(() => {
      void loadMessages();
      return undefined;
    }, [loadMessages]),
  );

  useEffect(() => {
    if (!user || !otherId) return;
    const channel = supabase.channel(`direct-messages-${user.id}-${otherId}`);

    const upsertRow = (row: Message) => {
      setMessages((current) => {
        if (current.some((item) => item.id === row.id)) return current;
        if (
          row.client_message_id &&
          current.some((item) => item.client_message_id === row.client_message_id)
        ) {
          return current.map((item) =>
            item.client_message_id === row.client_message_id
              ? { ...row, pending: false }
              : item,
          );
        }
        return [...current, { ...row, pending: false }];
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
    setMessages((current) => [...current, optimistic]);

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
      setMessages((current) => current.filter((item) => item.client_message_id !== clientMessageId));
      setDraft(body);
      Alert.alert("No se pudo enviar", error.message);
      return;
    }

    if (data) {
      setMessages((current) =>
        current.map((item) =>
          item.client_message_id === clientMessageId
            ? { ...(data as Message), pending: false }
            : item,
        ),
      );
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
          <Text className="text-2xl font-bold text-foreground">{otherName}</Text>
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 12, flexGrow: 1 }}
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
        )}

        <View className="mt-2 flex-row items-end gap-2">
          <TextInput
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
