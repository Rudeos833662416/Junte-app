import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
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
import { Image } from "expo-image";
import { setActiveChatId } from "@/lib/push-notifications";
import { friendlyChatError } from "@/lib/chat-errors";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { uploadUriToStorage } from "@/lib/media-upload";
import {
  formatChatDateLabel,
  getCachedConversation,
  getDraft,
  isSameMessageGroup,
  markInboxConversationRead,
  mergeCachedMessage,
  setCachedConversation,
  setDraft,
  clearDraft,
} from "@/lib/chat-store";

type Message = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
  client_message_id?: string | null;
  pending?: boolean;
  story_id?: number | null;
  kind?: string;
  audio_path?: string | null;
  audio_url?: string | null;
  duration_ms?: number | null;
  reply_to_message_id?: string | null;
  reply_to_body?: string | null;
  reply_to_sender_id?: string | null;
};

async function withSignedAudioUrl(message: Message) {
  if (!message.audio_path || message.audio_url) return message;
  const { data } = await supabase.storage.from("chat-audio").createSignedUrl(message.audio_path, 60 * 60 * 24);
  return { ...message, audio_url: data?.signedUrl ?? null };
}

function newClientMessageId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
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
  const [messages, setMessages] = useState<Message[]>(() => (otherId ? (getCachedConversation(otherId) as Message[]) : []));
  const [draft, setDraftState] = useState(() => (otherId ? getDraft(otherId) : ""));
  const [otherName, setOtherName] = useState(initialName || "Chat");
  const [otherAvatar, setOtherAvatar] = useState<string | null>(initialAvatar || null);
  const [loading, setLoading] = useState(() => !otherId || getCachedConversation(otherId).length === 0);
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [isOtherOnline, setIsOtherOnline] = useState(false);
  const [voiceSending, setVoiceSending] = useState(false);
  const [playingAudioPath, setPlayingAudioPath] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const isMountedRef = useRef(true);
  const isRecordingRef = useRef(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);
  const audioPlayer = useAudioPlayer();
  const audioPlayerStatus = useAudioPlayerStatus(audioPlayer);

  useEffect(() => {
    isRecordingRef.current = Boolean(recorderState.isRecording);
  }, [recorderState.isRecording]);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingSendTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = (e: { endCoordinates?: { height?: number } }) => {
      if (isMountedRef.current) setKeyboardHeight(Math.max(0, e.endCoordinates?.height ?? 0));
    };
    const onHide = () => {
      if (isMountedRef.current) setKeyboardHeight(0);
    };
    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    return () => {
      isMountedRef.current = false;
      showSub.remove();
      hideSub.remove();
    };
  }, []);

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
          message.sender_id === friendId && !message.read_at ? { ...message, read_at: readAt } : message,
        );
        if (otherId) setCachedConversation(otherId, next);
        return next;
      });
      markInboxConversationRead(friendId);
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
        .select("id, sender_id, recipient_id, body, created_at, read_at, client_message_id, story_id, kind, audio_path, duration_ms, reply_to_message_id")
        .or(`and(sender_id.eq.${user.id},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${user.id})`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const confirmed = await Promise.all((data ?? []).map((row) => withSignedAudioUrl(row as Message)));
      const withReplies = confirmed.map((msg) => {
        if (!msg.reply_to_message_id) return msg;
        const parent = confirmed.find((m) => m.id === msg.reply_to_message_id);
        return parent ? { ...msg, reply_to_body: parent.body, reply_to_sender_id: parent.sender_id } : msg;
      });
      setMessages((current) => {
        const confirmedIds = new Set(withReplies.map((message) => message.client_message_id).filter(Boolean));
        const pending = current.filter((message) => message.pending && !confirmedIds.has(message.client_message_id));
        const next = [...withReplies, ...pending].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
        setCachedConversation(otherId, next);
        return next;
      });
      await markAsRead(otherId);
      const profile = await supabase.from("public_profiles").select("name, avatar_url").eq("id", otherId).maybeSingle();
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
    const upsertRow = async (row: Message) => {
      const hydrated = await withSignedAudioUrl(row);
      setMessages((current) => {
        const next = mergeCachedMessage(current, { ...hydrated, pending: false });
        setCachedConversation(otherId, next);
        return next as Message[];
      });
      if (row.sender_id === otherId) void markAsRead(otherId);
    };
    channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages", filter: `recipient_id=eq.${user.id}` }, (payload) => {
      const row = payload.new as Message;
      if (row.sender_id === otherId) void upsertRow(row);
    });
    channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages", filter: `sender_id=eq.${user.id}` }, (payload) => {
      const row = payload.new as Message;
      if (row.recipient_id === otherId) void upsertRow(row);
    });
    channel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "direct_messages", filter: `recipient_id=eq.${user.id}` }, (payload) => void upsertRow(payload.new as Message));
    channel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "direct_messages", filter: `sender_id=eq.${user.id}` }, (payload) => void upsertRow(payload.new as Message));
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [markAsRead, otherId, user]);

  useEffect(() => {
    if (!user || !otherId) return;
    const channel = supabase.channel(`typing:${[user.id, otherId].sort().join(":")}`, {
      config: { broadcast: { self: false }, presence: { key: user.id } },
    });
    typingChannelRef.current = channel;
    channel.on("broadcast", { event: "typing" }, ({ payload }) => {
      if (payload?.userId !== otherId) return;
      setIsOtherTyping(Boolean(payload.typing));
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (payload.typing) typingTimeoutRef.current = setTimeout(() => setIsOtherTyping(false), 2000);
    });
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      setIsOtherOnline(Boolean(state[otherId]?.length));
    });
    void channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") await channel.track({ userId: user.id });
    });
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (typingSendTimeoutRef.current) clearTimeout(typingSendTimeoutRef.current);
      typingChannelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [otherId, user]);

  const updateDraft = (value: string) => {
    setDraftState(value);
    if (otherId) setDraft(otherId, value);
    if (!typingChannelRef.current || !user) return;
    if (typingSendTimeoutRef.current) clearTimeout(typingSendTimeoutRef.current);
    typingSendTimeoutRef.current = setTimeout(() => {
      void typingChannelRef.current?.send({ type: "broadcast", event: "typing", payload: { userId: user.id, typing: Boolean(value.trim()) } });
    }, 80);
  };

  const playVoiceMessage = (message: Message) => {
    if (!message.audio_url) {
      Alert.alert("Audio no disponible", "No se pudo obtener el audio privado de este mensaje.");
      return;
    }
    try {
      if (playingAudioPath === message.audio_path && audioPlayerStatus.playing) {
        try {
          audioPlayer.pause();
        } catch {
          /* SharedObject ya liberado */
        }
        return;
      }
      setPlayingAudioPath(message.audio_path ?? message.id);
      audioPlayer.replace(message.audio_url);
      audioPlayer.play();
    } catch {
      /* SharedObject de expo-audio ya liberado o no listo */
    }
  };

  const toggleVoiceRecording = async () => {
    if (!user || !otherId || voiceSending) return;
    if (recorderState.isRecording || isRecordingRef.current) {
      const durationMs = recorderState.durationMillis;
      setVoiceSending(true);
      isRecordingRef.current = false;
      try {
        try {
          await recorder.stop();
        } catch {
          /* SharedObject ya liberado al salir de la pantalla */
          setVoiceSending(false);
          return;
        }
        const uri = recorder.uri;
        if (!uri) throw new Error("La grabación no produjo un archivo de audio.");
        const clientMessageId = newClientMessageId();
        const audioPath = `${user.id}/${otherId}/${clientMessageId}.m4a`;
        await uploadUriToStorage("chat-audio", audioPath, uri, "audio/mp4");
        const { data: signedData, error: signedError } = await supabase.storage.from("chat-audio").createSignedUrl(audioPath, 60 * 60 * 24);
        if (signedError) throw signedError;
        const { data, error } = await supabase
          .from("direct_messages")
          .insert({
            sender_id: user.id,
            recipient_id: otherId,
            body: "Nota de voz",
            client_message_id: clientMessageId,
            kind: "voice_note",
            audio_path: audioPath,
            duration_ms: Math.max(0, Math.round(durationMs)),
          })
          .select("id, sender_id, recipient_id, body, created_at, read_at, client_message_id, story_id, kind, audio_path, duration_ms, reply_to_message_id")
          .single();
        if (error) throw error;
        if (data) {
          setMessages((current) => {
            const next = mergeCachedMessage(current, { ...(data as Message), audio_url: signedData?.signedUrl ?? null, pending: false });
            setCachedConversation(otherId, next);
            return next as Message[];
          });
        }
      } catch (error) {
        Alert.alert("No se pudo enviar el audio", friendlyChatError(error as { code?: string; message?: string }));
      } finally {
        setVoiceSending(false);
      }
      return;
    }
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permiso de micrófono", "Activa el micrófono en los ajustes de Android para grabar notas de voz.");
      return;
    }
    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
      isRecordingRef.current = true;
    } catch (error) {
      isRecordingRef.current = false;
      Alert.alert("No se pudo grabar", error instanceof Error ? error.message : "El micrófono no está disponible.");
    }
  };

  useEffect(() => {
    return () => {
      // No llamar a SharedObjects de expo-audio si el runtime nativo ya los liberó
      // al desmontar la pantalla (crash: "Cannot use shared object that was already released").
      if (isRecordingRef.current) {
        try {
          recorder.stop();
        } catch {
          /* already released */
        }
        isRecordingRef.current = false;
      }
      try {
        audioPlayer.pause();
      } catch {
        /* already released */
      }
    };
  }, [recorder, audioPlayer]);

  const sendMessage = async () => {
    const body = draft.trim();
    if (!user || !otherId || !body || sending) return;
    const clientMessageId = newClientMessageId();
    const replyingTo = replyTarget;
    const optimistic: Message = {
      id: `local-${clientMessageId}`,
      sender_id: user.id,
      recipient_id: otherId,
      body,
      created_at: new Date().toISOString(),
      read_at: null,
      client_message_id: clientMessageId,
      pending: true,
      reply_to_message_id: replyingTo?.id ?? null,
      reply_to_body: replyingTo?.body ?? null,
      reply_to_sender_id: replyingTo?.sender_id ?? null,
    };
    setDraftState("");
    clearDraft(otherId);
    setReplyTarget(null);
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
        reply_to_message_id: replyingTo && !String(replyingTo.id).startsWith("local-") ? replyingTo.id : null,
      })
      .select("id, sender_id, recipient_id, body, created_at, read_at, client_message_id, story_id, kind, audio_path, duration_ms, reply_to_message_id")
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
      setDraftState(body);
      setDraft(otherId, body);
      Alert.alert("No se pudo enviar", friendlyChatError(error));
      return;
    }
    if (data) {
      setMessages((current) => {
        const next = mergeCachedMessage(current, { ...(data as Message), pending: false, reply_to_body: replyingTo?.body ?? null });
        setCachedConversation(otherId, next);
        return next as Message[];
      });
    }
  };

  return (
    <ScreenContainer className="p-5">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}>
        <View className="mb-4 flex-row items-center gap-3">
          <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Volver">
            <Text className="text-2xl" style={{ color: colors.primary }}>‹</Text>
          </Pressable>
          <View className="min-w-0 flex-1 flex-row items-center gap-2">
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.border, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              {otherAvatar ? (
                <Image source={{ uri: otherAvatar }} style={{ width: 36, height: 36 }} contentFit="cover" cachePolicy="memory-disk" transition={0} recyclingKey={otherId} />
              ) : (
                <Text className="text-xs font-bold text-foreground">{(otherName || "?").slice(0, 1).toUpperCase()}</Text>
              )}
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-lg font-semibold text-foreground" numberOfLines={1}>{otherName}</Text>
              <Text className="text-xs" style={{ color: isOtherTyping ? colors.primary : colors.muted }}>
                {isOtherTyping ? "escribiendo…" : isOtherOnline ? "En línea" : ""}
              </Text>
            </View>
          </View>
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center"><ActivityIndicator color={colors.primary} /></View>
        ) : (
          <>
            {loadError ? (
              <View className="mb-3 rounded-xl border p-3" style={{ borderColor: `${colors.error}66`, backgroundColor: `${colors.error}12` }}>
                <Text className="text-sm text-foreground">{loadError}</Text>
                <Pressable onPress={() => void loadMessages()} accessibilityRole="button" accessibilityLabel="Reintentar" style={{ minHeight: 44, justifyContent: "center" }}>
                  <Text className="font-bold" style={{ color: colors.primary }}>Reintentar</Text>
                </Pressable>
              </View>
            ) : null}
            <FlatList
              data={messages}
              inverted
              removeClippedSubviews={false}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 2, paddingTop: 12, flexGrow: 1 }}
              ListEmptyComponent={<View className="flex-1 items-center justify-center py-16"><Text className="text-sm text-muted">Escribe el primer mensaje</Text></View>}
              renderItem={({ item, index }) => {
                const mine = item.sender_id === user?.id;
                const previous = messages[index + 1];
                const grouped = isSameMessageGroup(item, previous);
                const showDateSeparator = !previous || formatChatDateLabel(item.created_at) !== formatChatDateLabel(previous.created_at);
                const deliveryStatus = item.pending ? "sending" : item.read_at ? "read" : "delivered";
                return (
                  <View style={{ width: "100%" }}>
                    <Pressable
                      onLongPress={() => setReplyTarget(item)}
                      delayLongPress={280}
                      accessibilityRole="button"
                      accessibilityLabel="Citar mensaje"
                      style={{
                        alignSelf: mine ? "flex-end" : "flex-start",
                        maxWidth: "82%",
                        marginBottom: grouped ? 2 : 8,
                        borderRadius: 16,
                        borderTopLeftRadius: grouped && !mine ? 6 : 16,
                        borderTopRightRadius: grouped && mine ? 6 : 16,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        backgroundColor: mine ? colors.primary : colors.surface,
                        opacity: item.pending ? 0.65 : 1,
                      }}
                    >
                      {item.reply_to_message_id ? (
                        <View style={{ borderLeftWidth: 3, borderLeftColor: mine ? `${colors.background}99` : colors.primary, paddingLeft: 8, marginBottom: 6 }}>
                          <Text style={{ color: mine ? `${colors.background}CC` : colors.primary, fontSize: 10, fontWeight: "800" }}>Cita</Text>
                          <Text style={{ color: mine ? `${colors.background}CC` : colors.muted, fontSize: 11 }} numberOfLines={2}>{item.reply_to_body || "Mensaje"}</Text>
                        </View>
                      ) : null}
                      {item.kind === "voice_note" ? (
                        <Pressable onPress={() => playVoiceMessage(item)} accessibilityRole="button" accessibilityLabel="Reproducir nota de voz" style={{ minHeight: 40, minWidth: 150, flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <MaterialIcons name={audioPlayerStatus.playing && playingAudioPath === (item.audio_path ?? item.id) ? "pause" : "play-arrow"} size={22} color={mine ? colors.background : colors.foreground} />
                          <Text style={{ color: mine ? colors.background : colors.foreground }}>Nota de voz · {Math.max(1, Math.round((item.duration_ms ?? 0) / 1000))}s</Text>
                        </Pressable>
                      ) : (
                        <Text style={{ color: mine ? colors.background : colors.foreground }}>{item.body}</Text>
                      )}
                      <View className="mt-1 flex-row items-center justify-end gap-1">
                        <Text style={{ fontSize: 10, color: mine ? `${colors.background}CC` : colors.muted }}>
                          {new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </Text>
                        {mine ? (
                          deliveryStatus === "sending" ? <MaterialIcons name="schedule" size={12} color={`${colors.background}CC`} /> :
                          <MaterialIcons name="done-all" size={14} color={deliveryStatus === "read" ? "#7DD3FC" : `${colors.background}CC`} />
                        ) : null}
                      </View>
                    </Pressable>
                    {showDateSeparator ? (
                      <View style={{ width: "100%", alignItems: "center", marginTop: 12, marginBottom: 4 }}>
                        <Text style={{ color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 0.6 }}>{formatChatDateLabel(item.created_at)}</Text>
                      </View>
                    ) : null}
                  </View>
                );
              }}
            />
          </>
        )}

        <View style={{ paddingBottom: Math.max(keyboardHeight > 0 ? 8 : insets.bottom, 8) + (keyboardHeight > 0 ? keyboardHeight : 0), paddingTop: 8 }}>
          {replyTarget ? (
            <View className="mb-2 flex-row items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: colors.border, backgroundColor: colors.surface }}>
              <View style={{ flex: 1, borderLeftWidth: 3, borderLeftColor: colors.primary, paddingLeft: 8 }}>
                <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "800" }}>Respondiendo</Text>
                <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 12 }}>{replyTarget.body}</Text>
              </View>
              <Pressable onPress={() => setReplyTarget(null)} accessibilityRole="button" accessibilityLabel="Cancelar cita" style={{ minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" }}>
                <MaterialIcons name="close" size={18} color={colors.muted} />
              </Pressable>
            </View>
          ) : null}
          {recorderState.isRecording ? (
            <Text className="mb-2 text-xs font-bold" style={{ color: colors.error }}>
              Grabando nota de voz · {Math.max(1, Math.round(recorderState.durationMillis / 1000))}s · toca detener y enviar
            </Text>
          ) : null}
          <View className="flex-row items-end gap-2">
            <TextInput
              accessibilityLabel="Mensaje"
              value={draft}
              onChangeText={updateDraft}
              editable={!recorderState.isRecording}
              placeholder={recorderState.isRecording ? "Grabando…" : "Mensaje…"}
              placeholderTextColor={colors.muted}
              multiline
              maxLength={2000}
              style={{ flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderRadius: 18, borderColor: colors.border, color: colors.foreground, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 12 }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={draft.trim() ? "Enviar mensaje" : recorderState.isRecording ? "Detener y enviar nota de voz" : "Grabar nota de voz"}
              onPress={() => (draft.trim() ? void sendMessage() : void toggleVoiceRecording())}
              disabled={sending || voiceSending}
              style={({ pressed }) => ({ borderRadius: 18, backgroundColor: colors.primary, width: 48, height: 48, alignItems: "center", justifyContent: "center", opacity: pressed || sending || voiceSending ? 0.55 : 1 })}
            >
              <MaterialIcons name={draft.trim() ? "send" : recorderState.isRecording ? "stop" : "mic"} size={21} color={colors.background} />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
