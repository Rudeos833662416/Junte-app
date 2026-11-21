import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
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
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { resolveCachedChatAudio, resolveCachedChatMedia, uploadUriToStorage } from "@/lib/media-upload";
import { useChatMedia } from "@/hooks/use-chat-media";
import { ChatMediaViewer } from "@/components/chat-media-viewer";
import { JuntaVideoPlayer } from "@/components/junta-video-player";
import { ChatMessageActions } from "@/components/chat-message-actions";
import { ChatQuickCamera, type QuickCameraAsset } from "@/components/chat-quick-camera";
import { StoryVideoEditor, type StoryVideoEditorResult } from "@/components/story-video-editor";
import { SwipeableMessageBubble } from "@/components/swipeable-message-bubble";
import { VoiceRecordGestureButton } from "@/components/voice-record-gesture-button";
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
  media_path?: string | null;
  media_type?: string | null;
  media_url?: string | null;
  duration_ms?: number | null;
  reply_to_message_id?: string | null;
  reply_to_body?: string | null;
  reply_to_sender_id?: string | null;
  edited_at?: string | null;
  deleted_at?: string | null;
  reactions?: Record<string, string>;
  location_payload?: { name?: string; address?: string; lat?: number; lng?: number; venue_id?: number | null } | null;
  trim_start_ms?: number | null;
  trim_end_ms?: number | null;
  is_muted?: boolean;
  overlay_text?: string | null;
};

async function withSignedAudioUrl(message: Message) {
  if (!message.audio_path || message.audio_url) return message;
  const localOrSigned = await resolveCachedChatAudio(message.audio_path);
  return { ...message, audio_url: localOrSigned };
}

async function withSignedMediaUrl(message: Message) {
  if (!message.media_path || message.media_url) return message;
  const url = await resolveCachedChatMedia(message.media_path);
  return { ...message, media_url: url };
}

function newClientMessageId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function countMessageReactions(reactions?: Record<string, string>) {
  const counts: Record<string, number> = {};
  Object.values(reactions ?? {}).forEach((emoji) => { counts[emoji] = (counts[emoji] ?? 0) + 1; });
  return counts;
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
  const [voiceLocked, setVoiceLocked] = useState(false);
  const [playingAudioPath, setPlayingAudioPath] = useState<string | null>(null);
  const [voicePlaybackSpeed, setVoicePlaybackSpeed] = useState<1 | 1.5 | 2>(1);
  const [voiceBarWidths, setVoiceBarWidths] = useState<Record<string, number>>({});
  const [voiceUiActive, setVoiceUiActive] = useState(false);
  const micPermissionGrantedRef = useRef(false);
  const holdCancelledEarlyRef = useRef(false);
  const isStoppingVoiceRef = useRef(false);
  const voiceRecordStartedAtRef = useRef<number | null>(null);

  useEffect(() => {
    void requestRecordingPermissionsAsync()
      .then((res) => {
        micPermissionGrantedRef.current = Boolean(res?.granted);
      })
      .catch(() => undefined);
  }, []);
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const [actionsMessage, setActionsMessage] = useState<Message | null>(null);
  const [quickCameraVisible, setQuickCameraVisible] = useState(false);
  const [videoEditor, setVideoEditor] = useState<{ asset: QuickCameraAsset; durationMs: number } | null>(null);
  const chatMedia = useChatMedia();
  const [viewer, setViewer] = useState<{ uri: string; kind: "image" | "video"; trimStartMs?: number | null; trimEndMs?: number | null; muted?: boolean; overlayText?: string | null } | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);
  const replyPreviewOpacity = useRef(new Animated.Value(0)).current;
  const replyPreviewTranslateY = useRef(new Animated.Value(8)).current;
  const isMountedRef = useRef(true);
  const isRecordingRef = useRef(false);
  const isStartingRecordingRef = useRef(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);
  const audioPlayer = useAudioPlayer();
  const audioPlayerStatus = useAudioPlayerStatus(audioPlayer, 100);

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
        .select("id, sender_id, recipient_id, body, created_at, read_at, client_message_id, story_id, kind, audio_path, media_path, media_type, duration_ms, reply_to_message_id, edited_at, deleted_at, reactions, location_payload, trim_start_ms, trim_end_ms, is_muted, overlay_text")
        .or(`and(sender_id.eq.${user.id},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${user.id})`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const confirmed = await Promise.all((data ?? []).map(async (row) => withSignedMediaUrl(await withSignedAudioUrl(row as Message))));
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
      const hydrated = await withSignedMediaUrl(await withSignedAudioUrl(row));
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

  const cancelVoiceRecording = async () => {
    holdCancelledEarlyRef.current = true;
    isRecordingRef.current = false;
    voiceRecordStartedAtRef.current = null;
    setVoiceUiActive(false);
    setVoiceLocked(false);
    try { await recorder.stop(); } catch { /* already stopped or released */ }
  };

  const sendLocationMessage = async () => {
    if (!user || !otherId || sending) return;
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permiso de ubicación", "Activa la ubicación para compartir tu local actual.");
      return;
    }
    setSending(true);
    try {
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { data: nearby } = await supabase.rpc("find_pin_at_toast", {
        p_lat: position.coords.latitude,
        p_lng: position.coords.longitude,
        p_radius_meters: 35,
      });
      const pin = Array.isArray(nearby) ? nearby[0] as { id?: number; name?: string } | undefined : undefined;
      const locationPayload = {
        name: pin?.name ?? "Ubicación actual",
        address: "",
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        venue_id: pin?.id ?? null,
      };
      const clientMessageId = newClientMessageId();
      const { data, error } = await supabase.from("direct_messages").insert({
        sender_id: user.id,
        recipient_id: otherId,
        body: pin?.name ? `Estoy en ${pin.name}` : "Te comparto mi ubicación",
        kind: "location",
        location_payload: locationPayload,
        client_message_id: clientMessageId,
        reply_to_message_id: replyTarget?.id && !String(replyTarget.id).startsWith("local-") ? replyTarget.id : null,
      }).select("id, sender_id, recipient_id, body, created_at, read_at, client_message_id, story_id, kind, location_payload, reply_to_message_id, edited_at, deleted_at, reactions").single();
      if (error) throw error;
      if (data) {
        setMessages((current) => {
          const next = mergeCachedMessage(current, { ...(data as Message), pending: false });
          if (otherId) setCachedConversation(otherId, next);
          return next as Message[];
        });
        setReplyTarget(null);
      }
    } catch (error) {
      Alert.alert("No se pudo compartir la ubicación", friendlyChatError(error as { code?: string; message?: string }));
    } finally {
      setSending(false);
    }
  };

  const handleQuickCameraAsset = (asset: QuickCameraAsset) => {
    setQuickCameraVisible(false);
    if (asset.kind === "video") {
      setVideoEditor({ asset, durationMs: asset.durationMs ?? 90_000 });
      return;
    }
    chatMedia.setPendingMedia({ uri: asset.uri, kind: "image", mimeType: asset.mimeType, fileSize: asset.fileSize });
  };

  const publishEditedVideo = (result: StoryVideoEditorResult) => {
    if (!videoEditor) return;
    const { asset } = videoEditor;
    chatMedia.setPendingMedia({
      uri: asset.uri,
      kind: "video",
      mimeType: asset.mimeType,
      fileSize: asset.fileSize,
      durationMs: Math.max(1_000, result.endMs - result.startMs),
      trimStartMs: result.startMs,
      trimEndMs: result.endMs,
      isMuted: result.isMuted,
      overlayText: result.caption || result.overlayText,
    });
    setVideoEditor(null);
  };

  const editMessage = async (message: Message, body: string) => {
    if (!user || !otherId || message.sender_id !== user.id || !body.trim()) return;
    const previous = message;
    const editedAt = new Date().toISOString();
    const optimistic = { ...message, body: body.trim(), edited_at: editedAt };
    setMessages((current) => { const next = current.map((item) => item.id === message.id ? optimistic : item); setCachedConversation(otherId, next); return next; });
    const { error } = await supabase
      .from("direct_messages")
      .update({ body: body.trim(), edited_at: editedAt })
      .eq("id", message.id)
      .eq("sender_id", user.id);
    if (error) {
      setMessages((current) => { const next = current.map((item) => item.id === message.id ? previous : item); setCachedConversation(otherId, next); return next; });
      Alert.alert("No se pudo editar", friendlyChatError(error));
    }
  };

  const deleteMessage = async (message: Message) => {
    if (!user || !otherId || message.sender_id !== user.id) return;
    const deletedAt = new Date().toISOString();
    const optimistic = { ...message, body: "", deleted_at: deletedAt };
    setMessages((current) => { const next = current.map((item) => item.id === message.id ? optimistic : item); setCachedConversation(otherId, next); return next; });
    const { error } = await supabase
      .from("direct_messages")
      .update({ body: "", deleted_at: deletedAt })
      .eq("id", message.id)
      .eq("sender_id", user.id);
    if (error) {
      setMessages((current) => { const next = current.map((item) => item.id === message.id ? message : item); setCachedConversation(otherId, next); return next; });
      Alert.alert("No se pudo eliminar", friendlyChatError(error));
      return;
    }
    if (message.media_path) await supabase.storage.from("chat-media").remove([message.media_path]);
    if (message.audio_path) await supabase.storage.from("chat-audio").remove([message.audio_path]);
  };

  const reactToMessage = async (message: Message, emoji: string) => {
    if (!user || !otherId) return;
    const previousReactions = message.reactions ?? {};
    const currentEmoji = previousReactions[user.id];
    const nextReactions = { ...previousReactions };
    if (currentEmoji === emoji) delete nextReactions[user.id];
    else nextReactions[user.id] = emoji;
    setMessages((current) => { const next = current.map((item) => item.id === message.id ? { ...item, reactions: nextReactions } : item); setCachedConversation(otherId, next); return next; });
    const { data, error } = await supabase.rpc("toggle_message_reaction", { p_message_id: message.id, p_emoji: emoji });
    if (error) {
      setMessages((current) => { const next = current.map((item) => item.id === message.id ? { ...item, reactions: previousReactions } : item); setCachedConversation(otherId, next); return next; });
      Alert.alert("No se pudo reaccionar", friendlyChatError(error));
      return;
    }
    if (data) setMessages((current) => { const next = mergeCachedMessage(current, data as Message); setCachedConversation(otherId, next); return next as Message[]; });
  };

  const openMessageActions = (message: Message) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    setActionsMessage(message);
  };

  useEffect(() => {
    Animated.parallel([
      Animated.timing(replyPreviewOpacity, { toValue: replyTarget ? 1 : 0, duration: replyTarget ? 180 : 120, useNativeDriver: true }),
      Animated.spring(replyPreviewTranslateY, { toValue: replyTarget ? 0 : 8, useNativeDriver: true, speed: 22, bounciness: 5 }),
    ]).start();
  }, [replyPreviewOpacity, replyPreviewTranslateY, replyTarget]);

  const cycleVoicePlaybackSpeed = () => {
    const next: 1 | 1.5 | 2 = voicePlaybackSpeed === 1 ? 1.5 : voicePlaybackSpeed === 1.5 ? 2 : 1;
    setVoicePlaybackSpeed(next);
    try {
      audioPlayer.setPlaybackRate(next);
    } catch {
      /* ignore */
    }
  };

  const seekVoiceMessage = (message: Message, locationX: number, barWidth: number) => {
    const key = message.audio_path ?? message.id;
    if (playingAudioPath !== key || barWidth <= 0) return;
    const totalSec = Number(audioPlayerStatus.duration ?? 0) || Math.max(1, (message.duration_ms ?? 1000) / 1000);
    const ratio = Math.max(0, Math.min(1, locationX / barWidth));
    try {
      audioPlayer.seekTo(ratio * totalSec);
    } catch {
      /* ignore */
    }
  };

  const playVoiceMessage = async (message: Message) => {
    try {
      if (playingAudioPath === message.audio_path && audioPlayerStatus.playing) {
        try {
          audioPlayer.pause();
        } catch {
          /* SharedObject ya liberado */
        }
        return;
      }
      let uri = message.audio_url;
      if (!uri && message.audio_path) {
        uri = await resolveCachedChatAudio(message.audio_path);
      }
      if (!uri) {
        Alert.alert("Audio no disponible", "No se pudo obtener el audio privado de este mensaje.");
        return;
      }
      setPlayingAudioPath(message.audio_path ?? message.id);
      audioPlayer.replace(uri);
      try { audioPlayer.setPlaybackRate(voicePlaybackSpeed); } catch {}
      audioPlayer.play();
    } catch {
      /* SharedObject de expo-audio ya liberado o no listo */
    }
  };

  const MAX_VOICE_DURATION_MS = 15 * 60 * 1000;

  const formatVoiceTimer = (ms: number) => {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const stopAndSendVoiceRecording = async () => {
    if (!user || !otherId || voiceSending || isStoppingVoiceRef.current) return;
    if (!recorderState.isRecording && !isRecordingRef.current && !voiceUiActive) {
      holdCancelledEarlyRef.current = true;
      return;
    }
    isStoppingVoiceRef.current = true;
    const durationMs = Math.max(recorderState.durationMillis || 0, voiceRecordStartedAtRef.current ? Date.now() - voiceRecordStartedAtRef.current : 0);
    setVoiceUiActive(false);
    
    setVoiceLocked(false);
    isRecordingRef.current = false;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);

    if (isStartingRecordingRef.current) {
      holdCancelledEarlyRef.current = true;
      try { await recorder.stop(); } catch {}
      isStoppingVoiceRef.current = false;
      return;
    }

    setVoiceSending(true);
    try {
      try {
        await recorder.stop();
      } catch {
        setVoiceSending(false);
        isStoppingVoiceRef.current = false;
        return;
      }
      voiceRecordStartedAtRef.current = null;
      if (durationMs < 350) {
        setVoiceSending(false);
        isStoppingVoiceRef.current = false;
        return;
      }
      const uri = recorder.uri;
      if (!uri) throw new Error("La grabación no produjo un archivo de audio.");
      const clientMessageId = newClientMessageId();
      const optimisticId = `opt_voice_${clientMessageId}`;
      const optimisticMsg: Message = {
        id: optimisticId,
        sender_id: user.id,
        recipient_id: otherId,
        body: "Nota de voz",
        created_at: new Date().toISOString(),
        read_at: null,
        client_message_id: clientMessageId,
        kind: "voice_note",
        audio_path: null,
        audio_url: uri,
        duration_ms: Math.max(600, Math.round(durationMs)),
        pending: true,
      };
      setMessages((current) => [optimisticMsg, ...current]);

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
          duration_ms: Math.max(600, Math.round(durationMs)),
        })
        .select("id, sender_id, recipient_id, body, created_at, read_at, client_message_id, story_id, kind, audio_path, media_path, media_type, duration_ms, reply_to_message_id, edited_at, deleted_at, reactions, location_payload, trim_start_ms, trim_end_ms, is_muted, overlay_text")
        .single();
      if (error) throw error;
      if (data) {
        setMessages((current) => {
          const withoutOptimistic = current.filter((m) => m.id !== optimisticId);
          const next = mergeCachedMessage(withoutOptimistic, { ...(data as Message), audio_url: signedData?.signedUrl ?? uri, pending: false });
          setCachedConversation(otherId, next);
          return next as Message[];
        });
      }
    } catch (error) {
      setMessages((current) => current.filter((m) => !m.id.startsWith("opt_voice_")));
      Alert.alert("No se pudo enviar el audio", friendlyChatError(error as { code?: string; message?: string }));
    } finally {
      setVoiceSending(false);
      isStoppingVoiceRef.current = false;
    }
  };

  const startVoiceRecording = async () => {
    if (!user || !otherId || voiceSending || isStartingRecordingRef.current || isStoppingVoiceRef.current) return;
    if (recorderState.isRecording || isRecordingRef.current) return;

    holdCancelledEarlyRef.current = false;
    setVoiceUiActive(true);
    setVoiceLocked(false);
    
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);

    if (!micPermissionGrantedRef.current) {
      const permission = await requestRecordingPermissionsAsync();
      micPermissionGrantedRef.current = Boolean(permission.granted);
      if (!permission.granted) {
        setVoiceUiActive(false);
        Alert.alert("Permiso de micrófono", "Activa el micrófono en los ajustes para grabar notas de voz.");
        return;
      }
    }

    if (holdCancelledEarlyRef.current) {
      setVoiceUiActive(false);
      return;
    }

    isStartingRecordingRef.current = true;
    try {
      try { await recorder.stop(); } catch {}
      await recorder.prepareToRecordAsync();
      if (holdCancelledEarlyRef.current) {
        try { await recorder.stop(); } catch {}
        setVoiceUiActive(false);
        return;
      }
      recorder.record();
      voiceRecordStartedAtRef.current = Date.now();
      isRecordingRef.current = true;
    } catch {
      isRecordingRef.current = false;
      setVoiceUiActive(false);
      Alert.alert("No se pudo grabar", "El micrófono no está disponible. Inténtalo de nuevo.");
    } finally {
      isStartingRecordingRef.current = false;
    }
  };

  useEffect(() => {
    if (recorderState.isRecording && recorderState.durationMillis >= MAX_VOICE_DURATION_MS && !voiceSending && !isStoppingVoiceRef.current) {
      void stopAndSendVoiceRecording();
    }
  }, [recorderState.isRecording, recorderState.durationMillis, voiceSending]);

  const toggleVoiceRecording = async () => {
    if (!user || !otherId || voiceSending) return;
    if (recorderState.isRecording || isRecordingRef.current) {
      const durationMs = recorderState.durationMillis;
      setVoiceSending(true);
      setVoiceLocked(false);
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
          .select("id, sender_id, recipient_id, body, created_at, read_at, client_message_id, story_id, kind, audio_path, media_path, media_type, duration_ms, reply_to_message_id, edited_at, deleted_at, reactions, location_payload, trim_start_ms, trim_end_ms, is_muted, overlay_text")
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
    if (isStartingRecordingRef.current) return;
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) { Alert.alert("Permiso de micrófono", "Activa el micrófono en los ajustes para grabar notas de voz."); return; }
    isStartingRecordingRef.current = true;
    try {
      try { await recorder.stop(); } catch {}
      await recorder.prepareToRecordAsync();
      recorder.record();
      setVoiceLocked(false);
      isRecordingRef.current = true;
    } catch {
      isRecordingRef.current = false;
      Alert.alert("No se pudo grabar", "El micrófono no está disponible. Inténtalo de nuevo.");
    } finally { isStartingRecordingRef.current = false; }
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

  const sendPendingMedia = async () => {
    if (!user || !otherId || !chatMedia.pending) return;
    const pendingMedia = chatMedia.pending;
    const clientMessageId = newClientMessageId();
    const optimistic: Message = {
      id: `local-${clientMessageId}`,
      sender_id: user.id,
      recipient_id: otherId,
      body: chatMedia.caption.trim(),
      created_at: new Date().toISOString(),
      read_at: null,
      client_message_id: clientMessageId,
      kind: pendingMedia.kind,
      media_url: pendingMedia.uri,
      duration_ms: pendingMedia.durationMs ?? null,
      trim_start_ms: pendingMedia.trimStartMs ?? 0,
      trim_end_ms: pendingMedia.trimEndMs ?? pendingMedia.durationMs ?? null,
      is_muted: pendingMedia.isMuted,
      overlay_text: pendingMedia.overlayText ?? null,
      pending: true,
    };
    setMessages((current) => { const next = [optimistic, ...current]; setCachedConversation(otherId, next); return next; });
    chatMedia.clearPending();
    try {
      const fields = await chatMedia.uploadAndBuildFields(user.id, otherId, clientMessageId);
      if (!fields) throw new Error("No se pudo preparar el archivo multimedia.");
      const { data, error } = await supabase
        .from("direct_messages")
        .insert({
          sender_id: user.id, recipient_id: otherId, body: fields.body || "", kind: fields.kind,
          media_path: fields.media_path, media_type: fields.media_type, duration_ms: fields.duration_ms,
          trim_start_ms: fields.trim_start_ms, trim_end_ms: fields.trim_end_ms, is_muted: fields.is_muted,
          overlay_text: fields.overlay_text, client_message_id: clientMessageId,
          reply_to_message_id: replyTarget?.id && !String(replyTarget.id).startsWith("local-") ? replyTarget.id : null,
        })
        .select("id, sender_id, recipient_id, body, created_at, read_at, client_message_id, story_id, kind, audio_path, media_path, media_type, duration_ms, reply_to_message_id, edited_at, deleted_at, reactions, location_payload, trim_start_ms, trim_end_ms, is_muted, overlay_text")
        .single();
      if (error) throw error;
      if (data) {
        const hydrated = await withSignedMediaUrl(data as Message);
        setMessages((current) => { const next = mergeCachedMessage(current, hydrated); setCachedConversation(otherId, next); return next as Message[]; });
      }
      setReplyTarget(null);
    } catch (error) {
      setMessages((current) => { const next = current.filter((item) => item.id !== optimistic.id); setCachedConversation(otherId, next); return next; });
      Alert.alert("No se pudo enviar", friendlyChatError(error as { code?: string; message?: string }));
    }
  };

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
      .select("id, sender_id, recipient_id, body, created_at, read_at, client_message_id, story_id, kind, audio_path, media_path, media_type, duration_ms, reply_to_message_id, edited_at, deleted_at, reactions, location_payload, trim_start_ms, trim_end_ms, is_muted, overlay_text")
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
              ref={listRef}
              data={messages}
              inverted
              onScroll={(event) => setShowScrollToBottom(event.nativeEvent.contentOffset.y > 180)}
              scrollEventThrottle={16}
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
                    <SwipeableMessageBubble
                      onReply={() => setReplyTarget(item)}
                      color={colors.primary}
                      iconColor={colors.background}
                      onLongPress={() => openMessageActions(item)}
                      delayLongPress={280}
                      accessibilityRole="button"
                      accessibilityLabel="Abrir acciones del mensaje"
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
                      {item.kind === "image" || item.kind === "video" ? (
                        <Pressable
                          onPress={() => item.media_url && !item.deleted_at && setViewer({ uri: item.media_url, kind: item.kind === "video" ? "video" : "image", trimStartMs: item.trim_start_ms, trimEndMs: item.trim_end_ms, muted: item.is_muted, overlayText: item.overlay_text })}
                          accessibilityRole="button"
                          accessibilityLabel={item.kind === "video" ? "Ver vídeo" : "Ver foto"}
                        >
                          <View style={{ position: "relative" }}>
                            {item.kind === "video" && item.media_url ? (
                              <View pointerEvents="none" style={{ width: 240, height: 260, borderRadius: 14, overflow: "hidden", backgroundColor: "#05070C" }}>
                                <JuntaVideoPlayer uri={item.media_url} variant="story" muted={true} loop={true} trimStartSec={Math.max(0, (item.trim_start_ms ?? 0) / 1000)} trimEndSec={item.trim_end_ms != null ? item.trim_end_ms / 1000 : null} style={{ width: "100%", height: "100%" }} />
                              </View>
                            ) : (
                              <Image source={{ uri: item.media_url ?? undefined }} style={{ width: 240, maxHeight: 300, minHeight: 160, borderRadius: 14, backgroundColor: "#00000022" }} contentFit="contain" cachePolicy="disk" />
                            )}
                            {item.pending ? <View pointerEvents="none" style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color="#FFFFFF" /></View> : null}
                            {item.kind === "video" ? (
                              <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" }}>
                                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#00000088", alignItems: "center", justifyContent: "center" }}>
                                  <MaterialIcons name="play-arrow" size={28} color="#FFFFFF" />
                                </View>
                              </View>
                            ) : null}
                            {item.kind === "video" && item.duration_ms ? (
                              <Text style={{ position: "absolute", bottom: 8, right: 10, color: "#FFFFFF", fontSize: 11, fontWeight: "700", backgroundColor: "#00000088", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                                {Math.max(1, Math.floor(item.duration_ms / 1000))}s
                              </Text>
                            ) : null}
                          </View>
                          {item.body ? <Text style={{ marginTop: 6, color: mine ? colors.background : colors.foreground }}>{item.body}</Text> : null}
                        </Pressable>
                      ) : item.kind === "location" && item.location_payload ? (
                        <Pressable onPress={() => { const lat = item.location_payload?.lat; const lng = item.location_payload?.lng; if (typeof lat === "number" && typeof lng === "number") router.push({ pathname: "/(tabs)/map", params: { focusLat: String(lat), focusLng: String(lng), focusName: item.location_payload?.name ?? "Ubicación compartida", ...(item.location_payload?.venue_id ? { focusVenueId: String(item.location_payload.venue_id) } : {}) } }); }} accessibilityRole="button" accessibilityLabel="Abrir ubicación compartida" style={{ minWidth: 210, paddingVertical: 4 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}><MaterialIcons name="location-on" size={30} color={mine ? colors.background : colors.primary} /><View style={{ flex: 1 }}><Text style={{ color: mine ? colors.background : colors.foreground, fontWeight: "800" }}>{item.location_payload.name || "Ubicación compartida"}</Text><Text style={{ color: mine ? `${colors.background}CC` : colors.muted, fontSize: 11, marginTop: 2 }}>Toca para abrir en el mapa</Text></View></View>
                        </Pressable>
                      ) : item.kind === "voice_note" && !item.deleted_at ? (() => {
                        const voiceKey = item.audio_path ?? item.id;
                        const isThisAudio = playingAudioPath === voiceKey;
                        const isThisPlaying = isThisAudio && Boolean(audioPlayerStatus.playing);
                        const totalSec = isThisAudio && Number(audioPlayerStatus.duration ?? 0) > 0
                          ? Number(audioPlayerStatus.duration)
                          : Math.max(1, (item.duration_ms ?? 1000) / 1000);
                        const currentSec = isThisAudio ? Math.max(0, Number(audioPlayerStatus.currentTime ?? 0)) : 0;
                        const progress = totalSec > 0 ? Math.max(0, Math.min(1, currentSec / totalSec)) : 0;
                        const fg = mine ? colors.background : colors.foreground;
                        const trackBg = mine ? `${colors.background}38` : `${colors.primary}28`;
                        const fillBg = mine ? colors.background : colors.primary;
                        return (
                          <View style={{ minHeight: 44, minWidth: 215, flexDirection: "row", alignItems: "center", gap: 8 }}>
                            <Pressable
                              onPress={() => void playVoiceMessage(item)}
                              accessibilityRole="button"
                              accessibilityLabel={isThisPlaying ? "Pausar nota de voz" : "Reproducir nota de voz"}
                              style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: mine ? `${colors.background}24` : `${colors.primary}20`, alignItems: "center", justifyContent: "center" }}
                            >
                              <MaterialIcons name={isThisPlaying ? "pause" : "play-arrow"} size={22} color={fg} />
                            </Pressable>
                            <View style={{ flex: 1, gap: 4 }}>
                              <Pressable
                                onLayout={(e) => {
                                  const w = e.nativeEvent.layout.width;
                                  setVoiceBarWidths((prev) => (prev[voiceKey] === w ? prev : { ...prev, [voiceKey]: w }));
                                }}
                                onPress={(e) => seekVoiceMessage(item, e.nativeEvent.locationX, voiceBarWidths[voiceKey] ?? 120)}
                                style={{ height: 22, justifyContent: "center" }}
                                accessibilityLabel="Buscar en la nota de voz"
                              >
                                <View style={{ height: 4, borderRadius: 2, backgroundColor: trackBg }}>
                                  <View style={{ width: `${progress * 100}%`, height: 4, borderRadius: 2, backgroundColor: fillBg }} />
                                </View>
                              </Pressable>
                              <Text style={{ fontSize: 11, fontWeight: "700", color: fg, opacity: 0.85, fontVariant: ["tabular-nums"] }}>
                                {formatVoiceTimer((isThisAudio && currentSec > 0 ? currentSec : totalSec) * 1000)}
                              </Text>
                            </View>
                            {isThisAudio ? (
                              <Pressable
                                onPress={cycleVoicePlaybackSpeed}
                                accessibilityRole="button"
                                accessibilityLabel={`Velocidad ${voicePlaybackSpeed}x`}
                                style={{ paddingHorizontal: 7, paddingVertical: 4, borderRadius: 10, backgroundColor: mine ? `${colors.background}28` : `${colors.primary}22` }}
                              >
                                <Text style={{ color: fg, fontSize: 11, fontWeight: "800" }}>{voicePlaybackSpeed}x</Text>
                              </Pressable>
                            ) : null}
                          </View>
                        );
                      })() : (
                        <Text selectable style={{ color: item.deleted_at ? colors.muted : mine ? colors.background : colors.foreground, fontStyle: item.deleted_at ? "italic" : "normal", flexShrink: 1, maxWidth: "100%" }}>{item.deleted_at ? "Mensaje eliminado" : item.body}</Text>
                      )}
                      {Object.keys(countMessageReactions(item.reactions)).length > 0 ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 6 }}>{Object.entries(countMessageReactions(item.reactions)).map(([emoji, count]) => <Text key={emoji} style={{ color: mine ? colors.background : colors.foreground, fontSize: 12, backgroundColor: mine ? `${colors.background}33` : `${colors.primary}18`, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 }}>{emoji} {count}</Text>)}</View> : null}
                      <View className="mt-1 flex-row items-center justify-end gap-1">
                        <Text style={{ fontSize: 10, color: mine ? `${colors.background}CC` : colors.muted }}>
                          {new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}{item.edited_at ? " · editado" : ""}
                        </Text>
                        {mine ? (
                          deliveryStatus === "sending" ? <MaterialIcons name="schedule" size={12} color={`${colors.background}CC`} /> :
                          <MaterialIcons name="done-all" size={14} color={deliveryStatus === "read" ? "#7DD3FC" : `${colors.background}CC`} />
                        ) : null}
                      </View>
                    </SwipeableMessageBubble>
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
            <Animated.View style={{ opacity: replyPreviewOpacity, transform: [{ translateY: replyPreviewTranslateY }] }} className="mb-2 flex-row items-center gap-2 rounded-xl border px-3 py-2" >
              <View style={{ flex: 1, borderLeftWidth: 3, borderLeftColor: colors.primary, paddingLeft: 8 }}>
                <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "800" }}>Respondiendo</Text>
                <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 12 }}>{replyTarget.body}</Text>
              </View>
              <Pressable onPress={() => setReplyTarget(null)} accessibilityRole="button" accessibilityLabel="Cancelar cita" style={{ minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" }}>
                <MaterialIcons name="close" size={18} color={colors.muted} />
              </Pressable>
            </Animated.View>
          ) : null}
          {showScrollToBottom ? (
            <Pressable onPress={() => { listRef.current?.scrollToOffset({ offset: 0, animated: true }); setShowScrollToBottom(false); }} accessibilityRole="button" accessibilityLabel="Bajar al último mensaje" style={{ position: "absolute", right: 8, bottom: 76, width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", zIndex: 4 }}>
              <MaterialIcons name="keyboard-arrow-down" size={24} color={colors.primary} />
            </Pressable>
          ) : null}
          {(recorderState.isRecording || voiceUiActive) ? (
            <View className="mb-2 flex-row items-center gap-2.5 rounded-2xl px-3 py-2" style={{ backgroundColor: colors.surface }}>
              <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colors.error }} />
              <Text className="text-xs font-extrabold" style={{ color: colors.foreground, fontVariant: ["tabular-nums"] }}>
                {formatVoiceTimer(recorderState.durationMillis)}
              </Text>
              <Text className="flex-1 text-xs font-semibold" style={{ color: recorderState.durationMillis >= MAX_VOICE_DURATION_MS - 30000 ? colors.primary : colors.muted }} numberOfLines={1}>
                {recorderState.durationMillis >= MAX_VOICE_DURATION_MS - 30000
                  ? `Quedan ${Math.max(1, Math.ceil((MAX_VOICE_DURATION_MS - recorderState.durationMillis) / 1000))}s…`
                  : voiceLocked
                    ? "Manos libres activo · envía o descarta"
                    : "← Desliza para cancelar · ↑ para bloquear"}
              </Text>
              <Pressable onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined); void cancelVoiceRecording(); }} accessibilityRole="button" accessibilityLabel="Cancelar nota de voz" style={{ minHeight: 34, paddingHorizontal: 10, justifyContent: "center" }}>
                <Text style={{ color: colors.error, fontWeight: "800", fontSize: 12 }}>Eliminar</Text>
              </Pressable>
            </View>
          ) : null}
          {chatMedia.pending ? (
            <Modal visible animationType="slide" onRequestClose={chatMedia.clearPending}>
              <View style={{ flex: 1, backgroundColor: "#0A0A0A", paddingTop: insets.top + 8, paddingBottom: Math.max(insets.bottom, 8) + (keyboardHeight > 0 ? keyboardHeight : 0) }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 8 }}>
                  <Pressable onPress={chatMedia.clearPending} disabled={chatMedia.uploading} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}><MaterialIcons name="close" size={28} color="#FFFFFF" /></Pressable>
                  <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 15 }}>{chatMedia.pending.kind === "video" ? "Enviar vídeo" : "Enviar foto"}</Text>
                  <Pressable onPress={() => void sendPendingMedia()} disabled={chatMedia.uploading} style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.primary, opacity: chatMedia.uploading ? 0.6 : 1 }}><Text style={{ color: colors.background, fontWeight: "800", fontSize: 14 }}>{chatMedia.uploading ? "Enviando…" : "Enviar"}</Text></Pressable>
                </View>
                <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>{chatMedia.pending.kind === "video" ? <JuntaVideoPlayer uri={chatMedia.pending.uri} variant="viewer" loop={true} style={{ width: "100%", height: "100%" }} /> : <Image source={{ uri: chatMedia.pending.uri }} style={{ width: "100%", height: "85%" }} contentFit="contain" cachePolicy="disk" />}</View>
                <TextInput value={chatMedia.caption} onChangeText={chatMedia.setCaption} placeholder="Añade un comentario…" placeholderTextColor="#9CA3AF" style={{ margin: 16, color: "#FFFFFF", backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 24, paddingHorizontal: 18, paddingVertical: 12, fontSize: 15 }} />
              </View>
            </Modal>
          ) : null}
          <View className="flex-row items-end gap-2">
            <Pressable
              onPress={() =>
                Alert.alert("Adjuntar", undefined, [
                  { text: "Galería (Foto o Vídeo)", onPress: () => void chatMedia.pickMedia("library") },
                  { text: "Cámara", onPress: () => void chatMedia.pickMedia("camera") },
                  { text: "Cámara rápida", onPress: () => setQuickCameraVisible(true) },
                  { text: "Compartir ubicación/local", onPress: () => void sendLocationMessage() },
                  { text: "Cancelar", style: "cancel" },
                ])
              }
              disabled={sending || voiceSending || chatMedia.uploading}
              accessibilityRole="button"
              accessibilityLabel="Adjuntar foto o vídeo"
              style={{ width: 44, height: 48, alignItems: "center", justifyContent: "center" }}
            >
              <MaterialIcons name="add-circle-outline" size={26} color={colors.primary} />
            </Pressable>
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
            <VoiceRecordGestureButton
              recording={Boolean(recorderState.isRecording || voiceUiActive)}
              locked={voiceLocked}
              hasText={Boolean(draft.trim())}
              onPressSendText={() => void sendMessage()}
              onStartHold={() => void startVoiceRecording()}
              onReleaseSend={() => void stopAndSendVoiceRecording()}
              onCancel={() => { setVoiceUiActive(false);  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined); void cancelVoiceRecording(); }}
              onLock={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined); setVoiceLocked(true); }}
              disabled={sending || voiceSending}
              accessibilityLabel={draft.trim() ? "Enviar mensaje" : recorderState.isRecording ? "Soltar para enviar nota de voz; desliza a la izquierda para cancelar o arriba para bloquear" : "Mantén presionado para grabar nota de voz"}
              style={({ pressed }) => ({ borderRadius: 18, backgroundColor: colors.primary, width: (recorderState.isRecording || voiceUiActive) && !voiceLocked ? 54 : 48, height: (recorderState.isRecording || voiceUiActive) && !voiceLocked ? 54 : 48, alignItems: "center", justifyContent: "center", opacity: pressed || sending || voiceSending ? 0.72 : 1 })}
            >
              <MaterialIcons name={draft.trim() || voiceLocked ? "send" : recorderState.isRecording ? "mic" : "mic"} size={21} color={colors.background} />
            </VoiceRecordGestureButton>
          </View>
        </View>
      </KeyboardAvoidingView>
      <ChatQuickCamera visible={quickCameraVisible} onClose={() => setQuickCameraVisible(false)} onPick={handleQuickCameraAsset} />
      {videoEditor ? <StoryVideoEditor visible uri={videoEditor.asset.uri} durationMs={videoEditor.durationMs} fileSizeBytes={videoEditor.asset.fileSize} onCancel={() => setVideoEditor(null)} onPublish={publishEditedVideo} /> : null}
      {actionsMessage ? <ChatMessageActions
        visible
        messageId={actionsMessage.id}
        body={actionsMessage.body}
        mine={actionsMessage.sender_id === user?.id}
        deleted={Boolean(actionsMessage.deleted_at)}
        hasMedia={Boolean(actionsMessage.media_path || actionsMessage.audio_path || actionsMessage.location_payload)}
        onClose={() => setActionsMessage(null)}
        onReply={() => setReplyTarget(actionsMessage)}
        onCopy={() => void Clipboard.setStringAsync(actionsMessage.body)}
        onReact={(emoji) => void reactToMessage(actionsMessage, emoji)}
        onEdit={(body) => void editMessage(actionsMessage, body)}
        onDelete={() => void deleteMessage(actionsMessage)}
      /> : null}
      <ChatMediaViewer visible={!!viewer} uri={viewer?.uri ?? null} kind={viewer?.kind ?? null} trimStartMs={viewer?.trimStartMs} trimEndMs={viewer?.trimEndMs} muted={viewer?.muted} overlayText={viewer?.overlayText} onClose={() => setViewer(null)} />
    </ScreenContainer>
  );
}
