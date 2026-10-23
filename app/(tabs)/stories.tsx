import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { useAppRefresh } from "@/lib/app-refresh";
import { supabase } from "@/lib/supabase";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Alert, Animated, Easing, Image as RNImage, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image as ExpoImage } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { uploadUriToStorage, verifyPublicStorageUrl } from "@/lib/media-upload";

type SelectedMedia = {
  uri: string;
  mimeType: string;
  type: "image" | "video";
  name: string;
};

type StoryItem = {
  id: number;
  user_id: string;
  media_url: string;
  media_type: "image" | "video";
  audio_url: string | null;
  audio_name: string | null;
  music_title?: string | null;
  caption: string | null;
  visibility: "friends" | "public";
  privacy?: "all_friends" | "close_friends" | "public";
  created_at: string;
  expires_at: string;
  user_name?: string;
  avatar_url?: string | null;
};

type GroupedStoryUser = {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  isSelf: boolean;
  stories: StoryItem[];
  latestCreatedAt: string;
};

const MAX_STORY_VIDEO_BYTES = 80_000_000;
const MAX_COMPRESSED_VIDEO_BYTES = 25_000_000;
const MAX_STORY_DURATION_SECONDS = 15;

function formatStoryAge(createdAt: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000));
  if (seconds < 60) return `${Math.max(1, seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `hace ${hours} h`;
}

async function prepareStoryImage(uri: string) {
  return ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1440 } }],
    { format: ImageManipulator.SaveFormat.PNG },
  );
}

async function prepareStoryVideo(uri: string, onProgress: (progress: number) => void) {
  if (Platform.OS === "web") return uri;
  const { compress, getMetadata } = await import("expo-image-and-video-compressor");
  const sourceMetadata = await getMetadata(uri);
  if (sourceMetadata.duration > MAX_STORY_DURATION_SECONDS) {
    throw new Error("Las historias en vídeo pueden durar como máximo 15 segundos.");
  }
  if (sourceMetadata.size > MAX_STORY_VIDEO_BYTES) {
    throw new Error("El vídeo supera el límite de 80 MB.");
  }
  onProgress(0.1);
  const compressedUri = await compress(uri, {
    bitrate: 2_500_000,
    maxSize: 720,
    codec: "h264",
    speed: "fast",
    minimumFileSizeForCompress: 2_000_000,
    progressDivider: 5,
  }, (progress) => onProgress(0.1 + progress * 0.65));
  const compressedMetadata = await getMetadata(compressedUri);
  if (compressedMetadata.duration > MAX_STORY_DURATION_SECONDS || compressedMetadata.size > MAX_COMPRESSED_VIDEO_BYTES) {
    throw new Error("El vídeo no pudo quedar dentro de 15 segundos y 25 MB.");
  }
  onProgress(0.82);
  return compressedUri;
}

function StoryVideo({ uri, onReady }: { uri: string; onReady: () => void }) {
  const player = useVideoPlayer(uri, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.muted = false;
  });
  useEffect(() => {
    player.play();
    return () => player.pause();
  }, [player]);
  return <VideoView player={player} style={{ width: "100%", height: "100%" }} contentFit="contain" nativeControls={false} onLayout={onReady} />;
}

export default function StoriesScreen() {
  const colors = useColors();
  const { user } = useAuth({ autoFetch: true });
  const { revision } = useAppRefresh();
  const { userId: requestedUserId } = useLocalSearchParams<{ userId?: string }>();
  const insets = useSafeAreaInsets();

  const [groupedStories, setGroupedStories] = useState<GroupedStoryUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const hasLoadedStoriesOnce = useRef(false);
  const [isUploading, setIsUploading] = useState(false);
  const [, setUploadProgress] = useState(0);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  const [selectedMedia, setSelectedMedia] = useState<SelectedMedia | null>(null);
  const [caption, setCaption] = useState("");
  const [privacy, setPrivacy] = useState<"all_friends" | "close_friends" | "public">("all_friends");
  const [reactionByStory, setReactionByStory] = useState<Record<number, string | null>>({});
  const [storyReply, setStoryReply] = useState("");
  const [isStoryMediaLoading, setIsStoryMediaLoading] = useState(true);
  const [viewers, setViewers] = useState<{ viewer_id: string; name: string; avatar_url: string | null; viewed_at: string }[]>([]);
  const [viewerCountByStory, setViewerCountByStory] = useState<Record<number, number>>({});
  const [showViewers, setShowViewers] = useState(false);
  const [flyingEmojis, setFlyingEmojis] = useState<{ id: number; emoji: string; translateY: Animated.Value; opacity: Animated.Value }[]>([]);

  const [activeGroupIndex, setActiveGroupIndex] = useState<number | null>(null);
  const [activeStoryIndex, setActiveStoryIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [progressTimer, setProgressTimer] = useState(0);
  const [isChromeHidden, setIsChromeHidden] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number; at: number } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profileTransition = useRef(new Animated.Value(0)).current;
  const viewerSheetTouchStartY = useRef<number | null>(null);

  const fetchStories = useCallback(async () => {
    if (!user) {
      setGroupedStories([]);
      setIsLoading(false);
      return;
    }

    try {
      if (!hasLoadedStoriesOnce.current) setIsLoading(true);
      await supabase.rpc("purge_expired_stories");
      const { data, error } = await supabase
        .from("stories")
        .select("id, user_id, media_url, media_type, audio_url, audio_name, music_title, caption, visibility, privacy, created_at, expires_at")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });

      if (error) throw error;
      const rows = (data ?? []) as StoryItem[];
      const userIds = [...new Set(rows.map((r) => r.user_id))];

      const { data: profiles } = userIds.length
        ? await supabase.rpc("get_visible_profiles", { p_ids: userIds })
        : { data: [] };

      const profileMap = new Map(
        ((profiles ?? []) as { id: string; name: string | null; avatar_url: string | null }[]).map((p) => [
          p.id,
          { name: p.name?.trim() || "", avatarUrl: p.avatar_url },
        ]),
      );

      const map = new Map<string, StoryItem[]>();
      for (const row of rows) {
        const list = map.get(row.user_id) || [];
        list.push({
          ...row,
          user_name: row.user_id === user.id ? user.name : profileMap.get(row.user_id)?.name || "Usuario",
          avatar_url: row.user_id === user.id ? null : profileMap.get(row.user_id)?.avatarUrl,
        });
        map.set(row.user_id, list);
      }

      const groups: GroupedStoryUser[] = [];
      const selfList = map.get(user.id);
      if (selfList) {
        groups.push({
          userId: user.id,
          userName: "Mi estado",
          avatarUrl: profileMap.get(user.id)?.avatarUrl || null,
          isSelf: true,
          stories: selfList,
          latestCreatedAt: selfList[0]?.created_at || new Date().toISOString(),
        });
        map.delete(user.id);
      }

      for (const [uId, list] of map.entries()) {
        const info = profileMap.get(uId);
        groups.push({
          userId: uId,
          userName: info?.name || "Contacto",
          avatarUrl: info?.avatarUrl || null,
          isSelf: false,
          stories: list,
          latestCreatedAt: list[0]?.created_at || new Date().toISOString(),
        });
      }

      setGroupedStories(groups);
      const urlsToPrefetch = [...new Set(groups.flatMap((group) => group.stories.map((story) => story.media_url)).filter(Boolean))].slice(0, 30);
      void Promise.all(urlsToPrefetch.map((url) => RNImage.prefetch(url).catch(() => false)));
      if (requestedUserId) {
        const requestedIndex = groups.findIndex((group) => group.userId === requestedUserId);
        if (requestedIndex >= 0) {
          setActiveGroupIndex(requestedIndex);
          setActiveStoryIndex(0);
          setProgressTimer(0);
        }
      }
    } catch (err) {
      console.error("Error fetching stories:", err);
      setGroupedStories([]);
    } finally {
      hasLoadedStoriesOnce.current = true;
      setIsLoading(false);
    }
  }, [requestedUserId, user]);

  useEffect(() => {
    void fetchStories();
    if (!user) return;
    const channel = supabase
      .channel(`tragos-sociales-stories-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "stories" }, () => void fetchStories())
      .on("postgres_changes", { event: "*", schema: "public", table: "story_views" }, () => void fetchStories())
      .on("postgres_changes", { event: "*", schema: "public", table: "story_reactions" }, () => void fetchStories())
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => void fetchStories())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchStories, revision, user]);

  const pickMedia = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const uri = asset.uri;
        const type = asset.type === "video" ? "video" : "image";
        const durationMs = asset.duration ?? undefined;
        const fileSize = asset.fileSize ?? undefined;
        if (type === "video" && durationMs !== undefined && durationMs > MAX_STORY_DURATION_SECONDS * 1000) {
          Alert.alert("Vídeo demasiado largo", "Las historias en vídeo pueden durar como máximo 15 segundos.");
          return;
        }
        if (type === "video" && fileSize !== undefined && fileSize > MAX_STORY_VIDEO_BYTES) {
          Alert.alert("Vídeo demasiado pesado", "El vídeo seleccionado supera el límite de 80 MB.");
          return;
        }
        const filename = uri.split("/").pop() ?? `story_${Date.now()}.${type === "video" ? "mp4" : "jpg"}`;
        const mimeType = type === "video" ? "video/mp4" : "image/jpeg";
        setSelectedMedia({ uri, mimeType, type, name: filename });
      }
    } catch {
      Alert.alert("Error", "No se pudo seleccionar el archivo multimedia.");
    }
  };

  const publishStory = async () => {
    if (!user || !selectedMedia || isUploading) return;
    try {
      setIsUploading(true);
      setUploadMessage("Preparando contenido…");

      let finalUri = selectedMedia.uri;
      if (selectedMedia.type === "image") {
        const prepared = await prepareStoryImage(selectedMedia.uri);
        finalUri = prepared.uri;
      } else {
        finalUri = await prepareStoryVideo(selectedMedia.uri, (p) => setUploadProgress(p));
      }

      setUploadProgress(0.85);
      setUploadMessage("Subiendo estado…");

      const ext = selectedMedia.type === "video" ? "mp4" : "png";
      const mimeType = selectedMedia.type === "video" ? "video/mp4" : "image/png";
      const path = `${user.id}/${Date.now()}.${ext}`;
      await uploadUriToStorage("stories", path, finalUri, mimeType);

      const mediaUrl = await verifyPublicStorageUrl("stories", path, selectedMedia.type);

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const { error: insertError } = await supabase.from("stories").insert({
        user_id: user.id,
        media_url: mediaUrl,
        media_type: selectedMedia.type,
        caption: caption.trim() || null,
        visibility: privacy === "public" ? "public" : "friends",
        privacy,
        expires_at: expiresAt,
      });
      if (insertError) throw insertError;

      setSelectedMedia(null);
      setCaption("");
      setPrivacy("all_friends");
      setUploadMessage("Estado publicado…");
      await new Promise((r) => setTimeout(r, 600));
      await fetchStories();
    } catch (err) {
      Alert.alert("No se pudo publicar", err instanceof Error ? err.message : "Inténtalo de nuevo.");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      setUploadMessage(null);
    }
  };

  const recordStoryView = useCallback(async (storyId: number) => {
    if (!user) return;
    const { error } = await supabase.from("story_views").insert({ story_id: storyId, viewer_id: user.id });
    if (error && error.code !== "23505") console.warn("Story view unavailable:", error.message);
  }, [user]);

  const loadReaction = useCallback(async (storyId: number) => {
    if (!user) return;
    const { data, error } = await supabase
      .from("story_reactions")
      .select("emoji")
      .eq("story_id", storyId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) {
      console.warn("Story reactions unavailable:", error.message);
      return;
    }
    setReactionByStory((previous) => ({ ...previous, [storyId]: data?.emoji ?? null }));
  }, [user]);

  const animateQuickReaction = (emoji: string) => {
    const id = Date.now();
    const translateY = new Animated.Value(0);
    const opacity = new Animated.Value(1);
    setFlyingEmojis((current) => [...current, { id, emoji, translateY, opacity }]);
    Animated.parallel([
      Animated.timing(translateY, { toValue: -110, duration: 850, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 850, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start(() => setFlyingEmojis((current) => current.filter((item) => item.id !== id)));
  };

  const toggleReaction = async (storyId: number, emoji: string) => {
    if (!user || activeGroup?.isSelf) return;
    const current = reactionByStory[storyId] ?? null;
    const next = current === emoji ? null : emoji;
    setReactionByStory((previous) => ({ ...previous, [storyId]: next }));
    const result = next
      ? await supabase.from("story_reactions").upsert(
          { story_id: storyId, user_id: user.id, emoji: next },
          { onConflict: "story_id,user_id" },
        )
      : await supabase.from("story_reactions").delete().eq("story_id", storyId).eq("user_id", user.id);
    if (result.error) {
      setReactionByStory((previous) => ({ ...previous, [storyId]: current }));
      Alert.alert("No se pudo guardar", "Ejecuta la migración 0011 en Supabase y vuelve a intentarlo.");
      return;
    }
    if (next && activeGroup && !activeGroup.isSelf) {
      const { error: messageError } = await supabase.from("direct_messages").insert({ sender_id: user.id, recipient_id: activeGroup.userId, body: `${next} Reaccionó a tu Estado` });
      if (messageError) console.warn("No se pudo enviar la reacción al Chat:", messageError.message);
    }
  };

  const sendQuickReaction = async (emoji: string) => {
    if (!user || !activeGroup || activeGroup.isSelf) return;
    animateQuickReaction(emoji);
    const { error } = await supabase.from("direct_messages").insert({ sender_id: user.id, recipient_id: activeGroup.userId, body: emoji });
    if (error) Alert.alert("No se pudo enviar", "Ejecuta la migración 0020 en Supabase y vuelve a intentarlo.");
  };

  const sendStoryReply = async () => {
    const body = storyReply.trim();
    if (!user || !activeGroup || activeGroup.isSelf || !body) return;
    const { error } = await supabase.from("direct_messages").insert({ sender_id: user.id, recipient_id: activeGroup.userId, body });
    if (error) {
      Alert.alert("No se pudo enviar", "Ejecuta la migración 0020 en Supabase y vuelve a intentarlo.");
      return;
    }
    setStoryReply("");
  };

  useEffect(() => {
    setIsStoryMediaLoading(true);
  }, [activeStoryIndex, activeGroupIndex]);

  const loadViewerCount = useCallback(async (storyId: number) => {
    const { count, error } = await supabase.from("story_views").select("story_id", { count: "exact", head: true }).eq("story_id", storyId);
    if (!error) setViewerCountByStory((current) => ({ ...current, [storyId]: count ?? 0 }));
  }, []);

  const closeViewers = () => {
    setShowViewers(false);
    setIsPaused(false);
  };

  const handleViewerSheetTouchStart = (event: { nativeEvent: { pageY: number } }) => {
    viewerSheetTouchStartY.current = event.nativeEvent.pageY;
  };

  const handleViewerSheetTouchEnd = (event: { nativeEvent: { pageY: number } }) => {
    const startY = viewerSheetTouchStartY.current;
    viewerSheetTouchStartY.current = null;
    if (startY === null) return;
    if (event.nativeEvent.pageY - startY > 50) closeViewers();
  };

  const stopEventPropagation = (event: { stopPropagation?: () => void }) => {
    event.stopPropagation?.();
  };

  const loadViewers = async (storyId: number) => {
    const { data, error } = await supabase
      .from("story_views")
      .select("viewer_id, viewed_at")
      .eq("story_id", storyId)
      .order("viewed_at", { ascending: false });
    if (error) {
      Alert.alert("Vistas no disponibles", "Ejecuta la migración 0011 en Supabase para ver quién abrió este Estado.");
      return;
    }
    const rows = (data ?? []) as { viewer_id: string; viewed_at: string }[];
    const ids = rows.map((row) => row.viewer_id);
    const { data: profiles } = ids.length
      ? await supabase.rpc("get_visible_profiles", { p_ids: ids })
      : { data: [] };
    const profileMap = new Map(
      ((profiles ?? []) as { id: string; name: string | null; avatar_url: string | null }[]).map((profile) => [profile.id, profile]),
    );
    setViewerCountByStory((current) => ({ ...current, [storyId]: rows.length }));
    setViewers(rows.map((row) => ({
      viewer_id: row.viewer_id,
      viewed_at: row.viewed_at,
      name: profileMap.get(row.viewer_id)?.name?.trim() || "Usuario",
      avatar_url: profileMap.get(row.viewer_id)?.avatar_url ?? null,
    })));
    setIsPaused(true);
    setShowViewers(true);
  };

  const deleteStory = async (storyId: number) => {
    Alert.alert("Eliminar estado", "¿Quieres eliminar este estado?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          try {
            const { error } = await supabase.from("stories").delete().eq("id", storyId);
            if (error) throw error;
            setActiveGroupIndex(null);
            await fetchStories();
          } catch (err) {
            Alert.alert("Error", err instanceof Error ? err.message : "No se pudo eliminar.");
          }
        },
      },
    ]);
  };

  // Viewer timer logic
  useEffect(() => {
    if (activeGroupIndex === null || isPaused || showViewers) return;
    const interval = setInterval(() => {
      if (showViewers) return;
      setProgressTimer((prev) => {
        if (prev >= 1) {
          // Advance story
          const group = groupedStories[activeGroupIndex];
          if (group && activeStoryIndex < group.stories.length - 1) {
            setActiveStoryIndex((i) => i + 1);
            return 0;
          } else {
            // Close viewer or advance group
            if (activeGroupIndex < groupedStories.length - 1) {
              setActiveGroupIndex((g) => (g !== null ? g + 1 : null));
              setActiveStoryIndex(0);
              return 0;
            } else {
              setActiveGroupIndex(null);
              return 0;
            }
          }
        }
        return prev + 0.02; // ~5 seconds per story item
      });
    }, 100);
    return () => clearInterval(interval);
  }, [activeGroupIndex, activeStoryIndex, groupedStories, isPaused, showViewers]);

  const activeGroup = activeGroupIndex !== null ? groupedStories[activeGroupIndex] : null;
  const activeStory = activeGroup ? activeGroup.stories[activeStoryIndex] : null;

  useEffect(() => {
    const storyId = activeStory?.id;
    if (!storyId) return;
    setShowViewers(false);
    void loadReaction(storyId);
    if (activeGroup && !activeGroup.isSelf) void recordStoryView(storyId);
    void loadViewerCount(storyId);
  }, [activeStory?.id, activeGroup, loadReaction, recordStoryView, loadViewerCount]);

  const navigateToGroup = (nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= groupedStories.length || nextIndex === activeGroupIndex) return;
    setIsChromeHidden(false);
    Animated.timing(profileTransition, { toValue: 1, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => {
      setActiveGroupIndex(nextIndex);
      setActiveStoryIndex(0);
      setProgressTimer(0);
      profileTransition.setValue(-1);
      Animated.timing(profileTransition, { toValue: 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    });
  };

  const handleViewerTouchStart = (event: { nativeEvent: { pageX: number; pageY: number } }) => {
    setIsPaused(true);
    touchStartRef.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY, at: Date.now() };
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => setIsChromeHidden(true), 320);
  };

  const handleViewerTouchEnd = () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
    setIsPaused(false);
    setIsChromeHidden(false);
  };

  useEffect(() => {
    const storyId = activeStory?.id;
    if (!storyId || !user) return;
    const channel = supabase.channel(`story-view-count-${user.id}-${storyId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "story_views", filter: `story_id=eq.${storyId}` }, () => void loadViewerCount(storyId))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [activeStory?.id, loadViewerCount, user]);

  return (
    <ScreenContainer className="px-5 pt-3">
      <ScrollView contentContainerStyle={{ paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
        <View className="mb-4">
          <Text className="text-2xl font-black text-foreground">Estados</Text>
          <Text className="text-xs text-muted">Comparte momentos que desaparecen en 24 horas</Text>
        </View>

        {/* Mi estado */}
        <View className="mb-6 rounded-2xl border p-4 shadow-sm" style={{ backgroundColor: colors.surface, borderColor: `${colors.border}AA` }}>
          <Text className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">Tu Estado</Text>
          {groupedStories.find((g) => g.isSelf)?.stories.length ? (
            <Pressable
              onPress={() => {
                const idx = groupedStories.findIndex((g) => g.isSelf);
                if (idx >= 0) {
                  setActiveGroupIndex(idx);
                  setActiveStoryIndex(0);
                  setProgressTimer(0);
                }
              }}
              className="flex-row items-center justify-between"
            >
              <View className="flex-row items-center gap-3">
                <View className="relative h-14 w-14 items-center justify-center overflow-hidden rounded-full border-2" style={{ borderColor: colors.primary, borderRadius: 28 }}>
                  <ExpoImage source={{ uri: groupedStories.find((g) => g.isSelf)?.stories[0]?.media_url }} style={{ width: 52, height: 52, borderRadius: 26 }} contentFit="cover" cachePolicy="none" />
                </View>
                <View>
                  <Text className="text-base font-bold text-foreground">Mi estado</Text>
                  <Text className="text-xs text-muted">Pulsa para ver tus estados activos</Text>
                </View>
              </View>
              <Pressable onPress={pickMedia} className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: colors.primary }}>
                <IconSymbol name="plus" size={20} color="#FFFFFF" />
              </Pressable>
            </Pressable>
          ) : (
            <Pressable onPress={pickMedia} className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-3">
                <View className="h-14 w-14 items-center justify-center rounded-full border-2 border-dashed" style={{ borderColor: colors.primary, backgroundColor: `${colors.primary}12` }}>
                  <IconSymbol name="camera.fill" size={24} color={colors.primary} />
                </View>
                <View>
                  <Text className="text-base font-bold text-foreground">Añade una actualización</Text>
                  <Text className="text-xs text-muted">Comparte una foto o vídeo por 24 horas</Text>
                </View>
              </View>
              <View className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: colors.primary }}>
                <IconSymbol name="plus" size={20} color="#FFFFFF" />
              </View>
            </Pressable>
          )}
        </View>

        {/* Actualizaciones recientes */}
        <Text className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">Actualizaciones Recientes</Text>
        {isLoading ? (
          <View className="py-12 items-center justify-center">
            <ActivityIndicator color={colors.primary} />
            <Text className="mt-2 text-xs text-muted">Cargando estados…</Text>
          </View>
        ) : groupedStories.filter((g) => !g.isSelf).length === 0 ? (
          <View className="rounded-2xl border border-dashed p-8 items-center justify-center" style={{ borderColor: colors.border }}>
            <Text className="text-sm font-medium text-muted text-center">No hay estados recientes de tus amigos.</Text>
          </View>
        ) : (
          <View className="gap-3">
            {groupedStories.filter((g) => !g.isSelf).map((group, groupIdx) => {
              const realIndex = groupedStories.findIndex((g) => g.userId === group.userId);
              return (
                <Pressable
                  key={group.userId}
                  onPress={() => {
                    setActiveGroupIndex(realIndex);
                    setActiveStoryIndex(0);
                    setProgressTimer(0);
                  }}
                  className="flex-row items-center justify-between rounded-2xl border p-3.5 shadow-sm"
                  style={{ backgroundColor: colors.surface, borderColor: `${colors.border}AA` }}
                >
                  <View className="flex-row items-center gap-3">
                    <View className="relative h-14 w-14 items-center justify-center overflow-hidden rounded-full border-2 p-0.5" style={{ borderColor: colors.primary, borderRadius: 28 }}>
                      {group.avatarUrl ? (
                        <ExpoImage source={{ uri: group.avatarUrl }} style={{ width: 52, height: 52, borderRadius: 26 }} contentFit="cover" cachePolicy="none" />
                      ) : (
                        <View className="h-full w-full items-center justify-center rounded-full" style={{ backgroundColor: colors.primary }}>
                          <Text className="text-lg font-bold text-white">{group.userName[0]?.toUpperCase() ?? "?"}</Text>
                        </View>
                      )}
                    </View>
                    <View>
                      <Text className="text-base font-bold text-foreground">{group.userName}</Text>
                      <Text className="text-xs text-muted">{group.stories.length} estado{group.stories.length === 1 ? "" : "s"}</Text>
                    </View>
                  </View>
                  <IconSymbol name="chevron.right" size={18} color={colors.muted} />
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Modal Compositor / Previsualización antes de publicar */}
      <Modal visible={Boolean(selectedMedia)} animationType="slide" transparent>
        <View className="flex-1 justify-end bg-black/80">
          <View className="rounded-t-3xl border-t p-6" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-lg font-bold text-foreground">Nuevo Estado</Text>
              <Pressable onPress={() => setSelectedMedia(null)} className="p-1">
                <IconSymbol name="xmark.circle.fill" size={24} color={colors.muted} />
              </Pressable>
            </View>

            <View className="h-64 w-full overflow-hidden rounded-2xl bg-black mb-4">
              {selectedMedia?.type === "image" ? (
                <ExpoImage source={{ uri: selectedMedia.uri }} style={{ width: "100%", height: "100%" }} className="h-full w-full" contentFit="contain" cachePolicy="none" />
              ) : (
                <Text className="text-white text-center m-auto">Vídeo seleccionado</Text>
              )}
            </View>

            <TextInput
              value={caption}
              onChangeText={setCaption}
              placeholder="Añade un comentario (opcional)…"
              placeholderTextColor={colors.muted}
              className="rounded-xl border px-4 py-3 text-foreground mb-3"
              style={{ borderColor: colors.border, backgroundColor: colors.background }}
            />

            <Text className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Quién puede ver este Estado</Text>
            <View className="mb-4 flex-row gap-2">
              {([
                ["all_friends", "Todos mis amigos"],
                ["close_friends", "Amigos cercanos"],
                ["public", "Público"],
              ] as const).map(([value, label]) => (
                <Pressable
                  key={value}
                  onPress={() => setPrivacy(value)}
                  className="flex-1 rounded-xl border px-2 py-3 items-center"
                  style={{
                    borderColor: privacy === value ? colors.primary : colors.border,
                    backgroundColor: privacy === value ? `${colors.primary}20` : colors.background,
                  }}
                >
                  <Text className="text-center text-[11px] font-bold" style={{ color: privacy === value ? colors.primary : colors.muted }}>{label}</Text>
                </Pressable>
              ))}
            </View>

            {isUploading ? (
              <View className="py-4 items-center">
                <ActivityIndicator color={colors.primary} size="large" />
                <Text className="mt-2 text-xs font-semibold text-foreground">{uploadMessage || "Subiendo…"}</Text>
              </View>
            ) : (
              <Pressable onPress={() => void publishStory()} className="py-4 rounded-xl items-center" style={{ backgroundColor: colors.primary }}>
                <Text className="font-bold text-white">Publicar Estado</Text>
              </Pressable>
            )}
          </View>
        </View>
      </Modal>

      {/* Visor Inmersivo Estilo WhatsApp */}
      <Modal visible={activeGroup !== null && activeStory !== null} animationType="fade" transparent onRequestClose={() => setActiveGroupIndex(null)}>
        {activeGroup && activeStory ? (
          <Animated.View onTouchStart={handleViewerTouchStart} onTouchEnd={handleViewerTouchEnd} onTouchCancel={handleViewerTouchEnd} style={[{ flex: 1, position: "relative", backgroundColor: "#000000" }, { transform: [{ perspective: 900 }, { rotateY: profileTransition.interpolate({ inputRange: [-1, 0, 1], outputRange: ["-90deg", "0deg", "90deg"] }) }] }]}>
            {!isChromeHidden ? <View pointerEvents="none" style={{ position: "absolute", top: Math.max(insets.top, 12), left: 12, right: 12, zIndex: 3, flexDirection: "row", gap: 5 }}>
              {activeGroup.stories.map((story, index) => {
                const isPassed = index < activeStoryIndex;
                const isCurrent = index === activeStoryIndex;
                return (
                  <View key={story.id} style={{ flex: 1, height: 3, overflow: "hidden", borderRadius: 3, backgroundColor: "rgba(255,255,255,0.3)" }}>
                    <View style={{ height: "100%", width: isPassed ? "100%" : isCurrent ? `${progressTimer * 100}%` : "0%", backgroundColor: "#FFFFFF" }} />
                  </View>
                );
              })}
            </View> : null}

            {!isChromeHidden ? <View style={{ position: "absolute", top: Math.max(insets.top + 24, 44), left: 16, right: 12, zIndex: 4, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ width: 38, height: 38, borderRadius: 19, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: colors.primary }}>
                  {activeGroup.avatarUrl ? (
                    <ExpoImage source={{ uri: activeGroup.avatarUrl }} style={{ width: 38, height: 38, borderRadius: 19 }} contentFit="cover" cachePolicy="none" />
                  ) : (
                    <Text style={{ color: "#FFFFFF", fontWeight: "800" }}>{activeGroup.userName[0]?.toUpperCase() ?? "?"}</Text>
                  )}
                </View>
                <View>
                  <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "800" }}>{activeGroup.userName}</Text>
                  <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 11 }}>{formatStoryAge(activeStory.created_at)}</Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                {activeGroup.isSelf ? (
                  <Pressable onPress={() => void deleteStory(activeStory.id)} hitSlop={8} style={{ padding: 6 }}>
                    <IconSymbol name="trash.fill" size={20} color="#FF6B6B" />
                  </Pressable>
                ) : null}
              </View>
            </View> : null}

            <View pointerEvents="none" style={{ position: "absolute", inset: 0, zIndex: 1, alignItems: "center", justifyContent: "center" }}>
              {activeStory.media_type === "video" ? <StoryVideo uri={activeStory.media_url} onReady={() => setIsStoryMediaLoading(false)} /> : <ExpoImage source={{ uri: activeStory.media_url }} style={{ width: "100%", height: "100%" }} contentFit="contain" cachePolicy="memory-disk" onLoadStart={() => setIsStoryMediaLoading(true)} onLoad={() => setIsStoryMediaLoading(false)} onError={() => setIsStoryMediaLoading(false)} />}
              {isStoryMediaLoading ? <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.22)" }}><View style={{ width: "72%", height: "58%", borderRadius: 18, backgroundColor: "rgba(255,255,255,0.08)" }} /><ActivityIndicator color="#FFFFFF" size="large" style={{ position: "absolute" }} /></View> : null}
            </View>

            <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: 120, alignItems: "center", zIndex: 5 }}>
              {flyingEmojis.map((item) => <Animated.Text key={item.id} style={{ position: "absolute", fontSize: 34, transform: [{ translateY: item.translateY }], opacity: item.opacity }}>{item.emoji}</Animated.Text>)}
            </View>

            <View style={{ position: "absolute", top: 90, bottom: 150, left: 0, right: 0, zIndex: 2, flexDirection: "row" }}>
              <Pressable
                onTouchStart={(event) => { setIsPaused(true); touchStartRef.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY, at: Date.now() }; }}
                onTouchEnd={(event) => {
                  setIsPaused(false);
                  const start = touchStartRef.current;
                  touchStartRef.current = null;
                  if (!start) return;
                  const dx = event.nativeEvent.pageX - start.x;
                  const dy = event.nativeEvent.pageY - start.y;
                  const isShortTap = Date.now() - start.at < 300 && Math.abs(dx) < 24 && Math.abs(dy) < 24;
                  if ((dx > 60 && Math.abs(dx) > Math.abs(dy)) || isShortTap) {
                    if (activeStoryIndex > 0) { setActiveStoryIndex((index) => index - 1); setProgressTimer(0); }
                    else if (activeGroupIndex !== null && activeGroupIndex > 0) { setActiveGroupIndex((index) => (index !== null ? index - 1 : null)); setActiveStoryIndex(0); setProgressTimer(0); }
                  }
                }}
                style={{ flex: 1 }}
              />
              <Pressable
                onTouchStart={(event) => { setIsPaused(true); touchStartRef.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY, at: Date.now() }; }}
                onTouchEnd={(event) => {
                  setIsPaused(false);
                  const start = touchStartRef.current;
                  touchStartRef.current = null;
                  if (!start) return;
                  const dx = event.nativeEvent.pageX - start.x;
                  const dy = event.nativeEvent.pageY - start.y;
                  const isShortTap = Date.now() - start.at < 300 && Math.abs(dx) < 24 && Math.abs(dy) < 24;
                  if ((dx < -60 && Math.abs(dx) > Math.abs(dy)) || isShortTap) {
                    if (activeStoryIndex < activeGroup.stories.length - 1) { setActiveStoryIndex((index) => index + 1); setProgressTimer(0); }
                    else if (activeGroupIndex !== null && activeGroupIndex < groupedStories.length - 1) { setActiveGroupIndex((index) => (index !== null ? index + 1 : null)); setActiveStoryIndex(0); setProgressTimer(0); }
                    else setActiveGroupIndex(null);
                  }
                }}
                style={{ flex: 1 }}
              />
            </View>

            <View style={{ position: "absolute", left: 16, right: 16, bottom: Math.max(insets.bottom + 12, 28), zIndex: 4 }}>
              {activeStory.caption ? <Text style={{ marginBottom: 12, paddingHorizontal: 14, color: "#FFFFFF", textAlign: "center", fontSize: 14, fontWeight: "600" }}>{activeStory.caption}</Text> : null}
              {activeGroup.isSelf ? (
                <Pressable onPress={(event) => { stopEventPropagation(event); void loadViewers(activeStory.id); }} style={{ minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 24, paddingHorizontal: 18, backgroundColor: "rgba(0,0,0,0.68)" }}>
                  <IconSymbol name="eye" size={17} color="#FFFFFF" />
                  <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "800" }}>Visto por {viewerCountByStory[activeStory.id] ?? viewers.length} personas</Text>
                </Pressable>
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={{ flex: 1, minHeight: 46, flexDirection: "row", alignItems: "center", borderRadius: 24, paddingLeft: 14, paddingRight: 6, backgroundColor: "rgba(0,0,0,0.68)" }}>
                    <TextInput value={storyReply} onChangeText={setStoryReply} placeholder="Responder" placeholderTextColor="rgba(255,255,255,0.65)" style={{ flex: 1, minHeight: 40, color: "#FFFFFF", fontSize: 14 }} returnKeyType="send" onSubmitEditing={() => void sendStoryReply()} />
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 1 }}>
                      {["😍", "😂", "😮"].map((emoji) => <Pressable key={emoji} onPress={(event) => { stopEventPropagation(event); void sendQuickReaction(emoji); }} hitSlop={5} style={{ padding: 5 }}><Text style={{ fontSize: 19 }}>{emoji}</Text></Pressable>)}
                    </View>
                  </View>
                  <Pressable onPress={(event) => { stopEventPropagation(event); void toggleReaction(activeStory.id, "❤️"); }} style={{ width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: reactionByStory[activeStory.id] === "❤️" ? "#2F80ED" : "rgba(0,0,0,0.68)" }}>
                    <IconSymbol name="heart.fill" size={21} color="#FFFFFF" />
                  </Pressable>
                </View>
              )}
            </View>
          </Animated.View>
        ) : null}
      </Modal>

      <Modal visible={showViewers} transparent animationType="slide" onRequestClose={closeViewers}>
        <View className="flex-1 justify-end bg-black/70" onTouchStart={handleViewerSheetTouchStart} onTouchEnd={handleViewerSheetTouchEnd}>
          <View className="max-h-[70%] rounded-t-3xl p-6" style={{ backgroundColor: colors.surface }} onTouchStart={handleViewerSheetTouchStart} onTouchEnd={handleViewerSheetTouchEnd}>
            <View className="mb-4 flex-row items-center justify-between">
              <View>
                <Text className="text-lg font-black text-foreground">Vistas del Estado</Text>
                <Text className="text-xs text-muted">{viewers.length} persona{viewers.length === 1 ? "" : "s"} lo ha visto</Text>
              </View>
              <Pressable onPress={(event) => { stopEventPropagation(event); closeViewers(); }} className="p-2">
                <IconSymbol name="xmark" size={22} color={colors.muted} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {viewers.length === 0 ? (
                <Text className="py-8 text-center text-sm text-muted">Todavía nadie ha abierto este Estado.</Text>
              ) : viewers.map((viewer) => (
                <View key={viewer.viewer_id} className="mb-3 flex-row items-center gap-3 rounded-2xl border p-3" style={{ borderColor: colors.border }}>
                  {viewer.avatar_url ? (
                    <ExpoImage source={{ uri: viewer.avatar_url }} style={{ width: 40, height: 40 }} className="h-10 w-10 rounded-full" contentFit="cover" cachePolicy="none" />
                  ) : (
                    <View className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: colors.primary }}>
                      <Text className="font-bold text-white">{viewer.name[0]?.toUpperCase() ?? "?"}</Text>
                    </View>
                  )}
                  <View className="flex-1">
                    <Text className="text-sm font-bold text-foreground">{viewer.name}</Text>
                    <Text className="text-xs text-muted">Visto recientemente</Text>
                  </View>
                  <IconSymbol name="checkmark.circle.fill" size={18} color={colors.success} />
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
