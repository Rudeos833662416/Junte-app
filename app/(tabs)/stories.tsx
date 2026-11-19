import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { useAppRefresh } from "@/lib/app-refresh";
import { supabase } from "@/lib/supabase";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Alert, Animated, BackHandler, Easing, Image as RNImage, Modal, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useVideoPlayer, VideoView } from "expo-video";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useStoryUploadQueue } from "@/lib/story-upload-queue";
import { setActiveStoryUserId } from "@/lib/push-notifications";
import { resolveCachedVideoUri } from "@/lib/video-cache";
import { getCachedStoryGroups, setCachedStoryGroups, subscribeStoryGroups, type GroupedStoryUser, type StoryItem } from "@/lib/stories-store";
import Svg, { Circle } from "react-native-svg";

type SelectedMedia = {
  uri: string;
  mimeType: string;
  type: "image" | "video";
  name: string;
};

const MAX_STORY_VIDEO_BYTES = 300_000_000;
const MAX_STORY_DURATION_SECONDS = 300;
const TEXT_STORY_BACKGROUNDS = ["#FF6B00", "#1E88E5", "#8E24AA", "#00897B", "#D81B60", "#212121"];
const TEXT_STORY_FONTS = ["System", "serif", "monospace"];
const resolvedVideoCache = new Map<string, string>();

function formatStoryAge(createdAt: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000));
  if (seconds < 60) return `${Math.max(1, seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `hace ${hours} h`;
}

function StoryVideo({ uri, muted, paused, trimStart = 0, trimEnd, onReady, onTimeUpdate }: { uri: string; muted: boolean; paused: boolean; trimStart?: number; trimEnd?: number | null; onReady: () => void; onTimeUpdate: (currentTime: number, duration: number) => void }) {
  const [sourceUri, setSourceUri] = useState(() => resolvedVideoCache.get(uri) ?? uri);
  const player = useVideoPlayer(sourceUri, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.muted = muted;
    videoPlayer.timeUpdateEventInterval = 0.1;
  });
  useEffect(() => {
    if (resolvedVideoCache.has(uri)) return;
    let cancelled = false;
    void resolveCachedVideoUri(uri).then((resolved) => {
      resolvedVideoCache.set(uri, resolved);
      if (!cancelled) setSourceUri(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [uri]);
  useEffect(() => {
    const subscription = player.addListener("sourceLoad", ({ duration }) => {
      if (trimStart > 0 && Number.isFinite(duration) && duration > 0) player.currentTime = Math.min(trimStart, Math.max(0, duration - 0.05));
    });
    if (trimStart > 0 && player.duration > trimStart) player.currentTime = trimStart;
    return () => subscription.remove();
  }, [player, trimStart]);
  useEffect(() => {
    try {
      if (paused) player.pause();
      else player.play();
    }
    catch { /* El player puede estar liberándose durante un cambio de historia. */ }
    return () => {
      try { player.pause(); }
      catch { /* El player nativo ya fue liberado. */ }
    };
  }, [paused, player]);
  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);
  useEffect(() => {
    const subscription = player.addListener("timeUpdate", ({ currentTime }) => {
      const duration = player.duration;
      if (!Number.isFinite(duration) || duration <= 0) return;
      const effectiveStart = Math.min(trimStart, Math.max(0, duration - 0.05));
      const effectiveEnd = trimEnd != null ? Math.min(trimEnd, duration) : duration;
      if (trimEnd != null && currentTime >= effectiveEnd) {
        player.currentTime = effectiveStart;
        if (!paused) player.play();
        onTimeUpdate(effectiveEnd, duration);
        return;
      }
      onTimeUpdate(currentTime, duration);
    });
    return () => subscription.remove();
  }, [onTimeUpdate, paused, player, trimEnd, trimStart]);
  return <VideoView player={player} style={{ width: "100%", height: "100%" }} contentFit="contain" nativeControls={false} onFirstFrameRender={onReady} />;
}

function PreviewVideo({ uri, trimStart, trimEnd, muted, onDuration }: { uri: string; trimStart: number; trimEnd: number; muted: boolean; onDuration: (duration: number) => void }) {
  const player = useVideoPlayer(uri, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.muted = muted;
  });
  useEffect(() => {
    const sourceSubscription = player.addListener("sourceLoad", ({ duration }) => {
      if (Number.isFinite(duration) && duration > 0) {
        onDuration(duration);
        player.currentTime = Math.min(trimStart, Math.max(0, duration - 0.05));
      }
    });
    const timeSubscription = player.addListener("timeUpdate", ({ currentTime }) => {
      if (currentTime >= trimEnd) player.currentTime = trimStart;
    });
    return () => {
      sourceSubscription.remove();
      timeSubscription.remove();
    };
  }, [onDuration, player, trimEnd, trimStart]);
  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);
  useEffect(() => {
    try { player.play(); } catch { /* La vista previa puede cerrarse durante la inicialización. */ }
    return () => { try { player.pause(); } catch { /* El reproductor nativo puede haberse liberado. */ } };
  }, [player]);
  return <VideoView player={player} style={{ width: "100%", height: "100%" }} contentFit="contain" nativeControls={false} />;
}

function TrimRangeControl({ duration, range, colors, onChange }: { duration: number; range: { start: number; end: number }; colors: ReturnType<typeof useColors>; onChange: (range: { start: number; end: number }) => void }) {
  const [trackWidth, setTrackWidth] = useState(1);
  const safeDuration = Math.max(duration, 1);
  const selectTime = (locationX: number) => {
    const time = Math.min(safeDuration, Math.max(0, (locationX / trackWidth) * safeDuration));
    const startDistance = Math.abs(time - range.start);
    const endDistance = Math.abs(time - range.end);
    if (startDistance <= endDistance) onChange({ start: Math.min(time, range.end - 0.1), end: range.end });
    else onChange({ start: range.start, end: Math.max(time, range.start + 0.1) });
  };
  return <View className="mt-3 rounded-2xl px-3 py-3" style={{ backgroundColor: "rgba(28,28,30,0.88)" }}>
    <View className="mb-2 flex-row items-center justify-between">
      <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "800" }}>Recortar vídeo</Text>
      <Text style={{ color: "rgba(255,255,255,0.72)", fontSize: 12 }}>{range.start.toFixed(1)}s — {range.end.toFixed(1)}s</Text>
    </View>
    <Pressable accessibilityRole="adjustable" accessibilityLabel="Seleccionar inicio o fin del vídeo" onLayout={(event) => setTrackWidth(Math.max(1, event.nativeEvent.layout.width))} onPress={(event) => selectTime(event.nativeEvent.locationX)} style={{ height: 30, justifyContent: "center" }}>
      <View style={{ height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.28)" }} />
      <View pointerEvents="none" style={{ position: "absolute", left: `${(range.start / safeDuration) * 100}%`, right: `${100 - (range.end / safeDuration) * 100}%`, height: 5, borderRadius: 3, backgroundColor: colors.primary }} />
    </Pressable>
    <View className="flex-row justify-between">
      <Text style={{ color: "rgba(255,255,255,0.65)", fontSize: 11 }}>Inicio</Text>
      <Text style={{ color: "rgba(255,255,255,0.65)", fontSize: 11 }}>Fin</Text>
    </View>
  </View>;
}

function SegmentedStoryRing({ stories, avatarUrl, colors, viewedStoryIds }: { stories: StoryItem[]; avatarUrl: string | null; colors: ReturnType<typeof useColors>; viewedStoryIds: Set<number> }) {
  const size = 60;
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const gap = stories.length > 1 ? 6 : 0;
  const segment = stories.length ? 360 / stories.length - gap : 360;
  return <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
    <Svg width={size} height={size} style={{ position: "absolute" }}>
      {stories.map((story, index) => <Circle key={story.id} cx={size / 2} cy={size / 2} r={radius} fill="transparent" stroke={viewedStoryIds.has(story.id) ? "#9CA3AF" : colors.primary} strokeWidth={strokeWidth} strokeDasharray={`${(segment / 360) * circumference} ${circumference}`} strokeLinecap="round" transform={`rotate(${index * (360 / stories.length) - 90 + gap / 2} ${size / 2} ${size / 2})`} />)}
    </Svg>
    {avatarUrl ? <ExpoImage source={{ uri: avatarUrl }} style={{ width: 50, height: 50, borderRadius: 25 }} contentFit="cover" cachePolicy="memory-disk" /> : <View style={{ width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary }}><Text style={{ color: "#FFFFFF", fontSize: 18, fontWeight: "800" }}>?</Text></View>}
  </View>;
}

export default function StoriesScreen({ embedded = false, requestedUserId: embeddedUserId, requestedStoryId: embeddedStoryId, onViewerClose }: { embedded?: boolean; requestedUserId?: string | null; requestedStoryId?: string | null; onViewerClose?: () => void }) {
  const colors = useColors();
  const { user } = useAuth({ autoFetch: true });
  const { revision } = useAppRefresh();
  const { userId: routeUserId, storyId: routeStoryId } = useLocalSearchParams<{ userId?: string; storyId?: string }>();
  const requestedUserId = embeddedUserId ?? routeUserId;
  const requestedStoryId = embeddedStoryId ?? routeStoryId;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { keyboardHeight, isKeyboardVisible } = useKeyboardInset();

  const [groupedStories, setGroupedStories] = useState<GroupedStoryUser[]>(() => getCachedStoryGroups());
  const [isLoading, setIsLoading] = useState(() => getCachedStoryGroups().length === 0);
  const hasLoadedStoriesOnce = useRef(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { jobs, enqueue, retry } = useStoryUploadQueue();
  const userUploadJobs = useMemo(() => Object.values(jobs).filter((job) => job.userId === user?.id), [jobs, user?.id]);
  const activeUpload = userUploadJobs.find((job) => job.status === "queued" || job.status === "uploading");
  const failedUpload = userUploadJobs.find((job) => job.status === "failed");
  const isUploading = Boolean(activeUpload);
  const uploadMessage = activeUpload
    ? `${activeUpload.status === "queued" ? "En cola" : "Subiendo"}… ${Math.round(activeUpload.progress * 100)}%`
    : null;

  const [selectedMedia, setSelectedMedia] = useState<SelectedMedia | null>(null);
  const [videoDuration, setVideoDuration] = useState(1);
  const [trimRange, setTrimRange] = useState({ start: 0, end: 1 });
  const [optimisticStories, setOptimisticStories] = useState<StoryItem[]>([]);
  const [selfAvatarUrl, setSelfAvatarUrl] = useState<string | null>(null);
  const [showTextCreator, setShowTextCreator] = useState(false);
  const [textDraft, setTextDraft] = useState("");
  const [textBackgroundColor, setTextBackgroundColor] = useState(TEXT_STORY_BACKGROUNDS[0]);
  const [textFontFamily, setTextFontFamily] = useState(TEXT_STORY_FONTS[0]);
  const [isPublishingText, setIsPublishingText] = useState(false);
  const [caption, setCaption] = useState("");
  const [privacy, setPrivacy] = useState<"all_friends" | "close_friends" | "public">("all_friends");
  const [reactionByStory, setReactionByStory] = useState<Record<number, string | null>>({});
  const [viewedStoryIds, setViewedStoryIds] = useState<Set<number>>(new Set());
  const [storyReply, setStoryReply] = useState("");
  const [isStoryMediaLoading, setIsStoryMediaLoading] = useState(false);
  const [previewMuted, setPreviewMuted] = useState(false);
  const [videoMuted, setVideoMuted] = useState(false);
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
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchInFlightRef = useRef(false);
  const requestedUserConsumedRef = useRef<string | null>(null);
  const videoAdvancedStoryRef = useRef<number | null>(null);
  const closeStoryViewer = useCallback(() => {
    setActiveGroupIndex(null);
    setActiveStoryIndex(0);
    setProgressTimer(0);
    setIsPaused(false);
    setIsChromeHidden(false);
    onViewerClose?.();
  }, [onViewerClose]);

  useEffect(() => {
    setActiveStoryUserId(activeGroupIndex === null ? null : groupedStories[activeGroupIndex]?.userId ?? null);
    return () => setActiveStoryUserId(null);
  }, [activeGroupIndex, groupedStories]);

  useEffect(() => subscribeStoryGroups((groups) => setGroupedStories(groups)), []);

  useEffect(() => {
    const requestKey = `${requestedUserId ?? ""}:${requestedStoryId ?? ""}`;
    if ((!requestedUserId && !requestedStoryId) || requestedUserConsumedRef.current === requestKey) return;
    const requestedIndex = groupedStories.findIndex((group) => requestedUserId ? group.userId === requestedUserId : group.stories.some((story) => String(story.id) === requestedStoryId));
    if (requestedIndex < 0) return;
    const requestedStoryIndex = requestedStoryId ? groupedStories[requestedIndex].stories.findIndex((story) => String(story.id) === requestedStoryId) : -1;
    requestedUserConsumedRef.current = requestKey;
    setActiveGroupIndex(requestedIndex);
    setActiveStoryIndex(Math.max(0, requestedStoryIndex));
    setProgressTimer(0);
  }, [groupedStories, requestedStoryId, requestedUserId]);

  useEffect(() => {
    if (!requestedUserId && !requestedStoryId) requestedUserConsumedRef.current = null;
  }, [requestedStoryId, requestedUserId]);

  useEffect(() => {
    if (!user?.id) return;
    void supabase
      .from("profiles")
      .select("avatar_url")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.avatar_url) setSelfAvatarUrl(data.avatar_url);
      });
  }, [user?.id]);
  useEffect(() => {
    if (!user?.id) return;
    const key = `stories-viewed:${user.id}`;
    let cancelled = false;
    void Promise.all([
      AsyncStorage.getItem(key),
      supabase.from("story_views").select("story_id").eq("viewer_id", user.id),
    ]).then(([stored, result]) => {
      if (cancelled) return;
      const localIds = stored ? JSON.parse(stored) as number[] : [];
      const serverIds = result.data?.map((row) => row.story_id) ?? [];
      const ids = [...new Set([...localIds, ...serverIds])];
      setViewedStoryIds(new Set(ids));
      void AsyncStorage.setItem(key, JSON.stringify(ids));
    }).catch(() => {
      // La vista puede continuar con el caché vacío si el almacenamiento no está disponible.
    });
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    const onBack = () => {
      if (showViewers) { closeViewers(); return true; }
      if (activeGroupIndex !== null) { closeStoryViewer(); return true; }
      if (selectedMedia) { setSelectedMedia(null); return true; }
      if (showTextCreator) { setShowTextCreator(false); return true; }
      return false;
    };
    const subscription = BackHandler.addEventListener("hardwareBackPress", onBack);
    return () => subscription.remove();
  }, [activeGroupIndex, closeStoryViewer, selectedMedia, showTextCreator, showViewers]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        // Tabs se congelan fuera de foco; cerrar el visor evita que un refresh
        // Realtime/AppState lo vuelva a presentar al regresar a la app.
        setActiveGroupIndex(null);
        setActiveStoryIndex(0);
        setProgressTimer(0);
        setIsPaused(false);
        setShowViewers(false);
        setIsChromeHidden(false);
      };
    }, []),
  );

  // Optimización: el filtrado O(n) por render se reemplaza por una lista memoizada.
  const friendGroups = useMemo(() => groupedStories.filter((group) => !group.isSelf && group.userId !== user?.id), [groupedStories, user?.id]);
  const recentFriendGroups = useMemo(() => friendGroups.filter((group) => group.stories.some((story) => !viewedStoryIds.has(story.id))), [friendGroups, viewedStoryIds]);
  const viewedFriendGroups = useMemo(() => friendGroups.filter((group) => group.stories.every((story) => viewedStoryIds.has(story.id))), [friendGroups, viewedStoryIds]);

  // Optimización: la edad relativa se calcula una vez por historia (en la carga)
  // en lugar de recalcular Date.now() en cada render/tick del visor.
  const storyAgeById = useMemo(() => {
    const map = new Map<number, string>();
    for (const group of groupedStories) {
      for (const story of group.stories) map.set(story.id, formatStoryAge(story.created_at));
    }
    return map;
  }, [groupedStories]);

  const fetchStories = useCallback(async () => {
    if (fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;
    if (!user) {
      setGroupedStories([]);
      setIsLoading(false);
      fetchInFlightRef.current = false;
      return;
    }

    try {
      setLoadError(null);
      if (!hasLoadedStoriesOnce.current) setIsLoading(true);
      await supabase.rpc("purge_expired_stories");
      const { data, error } = await supabase
        .from("stories")
        .select("id, user_id, media_url, media_type, audio_url, audio_name, music_title, caption, visibility, privacy, created_at, expires_at, text_content, text_background_color, text_font_family, trim_start_sec, trim_end_sec")
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
      const ownAvatarUrl = profileMap.get(user.id)?.avatarUrl;
      if (ownAvatarUrl !== undefined) setSelfAvatarUrl(ownAvatarUrl || null);

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
      const resolvedSelfAvatar = profileMap.get(user.id)?.avatarUrl || selfAvatarUrl || null;
      if (selfList) {
        groups.push({
          userId: user.id,
          userName: "Mi estado",
          avatarUrl: resolvedSelfAvatar,
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

      const unmatchedRealIds = new Set((selfList ?? []).map((story) => story.id));
      const pendingOptimistic = optimisticStories.filter((optimistic) => {
        const match = (selfList ?? []).find((real) => {
          if (!unmatchedRealIds.has(real.id) || real.media_type !== optimistic.media_type) return false;
          const sameText = real.media_type !== "text" || (
            real.text_content === optimistic.text_content &&
            real.text_background_color === optimistic.text_background_color
          );
          const sameCaption = real.caption === optimistic.caption;
          const closeInTime = Math.abs(new Date(real.created_at).getTime() - new Date(optimistic.created_at).getTime()) < 10 * 60 * 1000;
          return sameText && sameCaption && closeInTime;
        });
        if (!match) return true;
        unmatchedRealIds.delete(match.id);
        return false;
      });
      if (pendingOptimistic.length) {
        const optimisticSelf = groups.find((group) => group.isSelf);
        if (optimisticSelf) optimisticSelf.stories = [...pendingOptimistic.filter((item) => !optimisticSelf.stories.some((story) => story.id === item.id)), ...optimisticSelf.stories];
        else groups.unshift({ userId: user.id, userName: "Mi estado", avatarUrl: resolvedSelfAvatar, isSelf: true, stories: pendingOptimistic, latestCreatedAt: pendingOptimistic[0].created_at });
      }
      setOptimisticStories((previous) => previous.length === pendingOptimistic.length && previous.every((item, index) => item.id === pendingOptimistic[index]?.id) ? previous : pendingOptimistic);
      setCachedStoryGroups(groups);
      setGroupedStories(groups);
      const urlsToPrefetch = [...new Set(groups.flatMap((group) => group.stories.map((story) => story.media_url).filter((url): url is string => Boolean(url))))].slice(0, 30);
      void Promise.all(urlsToPrefetch.map((url) => RNImage.prefetch(url).catch(() => false)));
      const videosToWarm = [...new Set(groups.flatMap((group) => group.stories.filter((story) => story.media_type === "video").map((story) => story.media_url).filter((url): url is string => Boolean(url))))].slice(0, 6);
      void Promise.all(videosToWarm.map(async (url) => {
        const resolved = await resolveCachedVideoUri(url).catch(() => url);
        resolvedVideoCache.set(url, resolved);
        return resolved;
      }));
      const requestKey = `${requestedUserId ?? ""}:${requestedStoryId ?? ""}`;
      if ((requestedUserId || requestedStoryId) && requestedUserConsumedRef.current !== requestKey) {
        const requestedIndex = groups.findIndex((group) => requestedUserId ? group.userId === requestedUserId : group.stories.some((story) => String(story.id) === requestedStoryId));
        if (requestedIndex >= 0) {
          const requestedStoryIndex = requestedStoryId ? groups[requestedIndex].stories.findIndex((story) => String(story.id) === requestedStoryId) : -1;
          requestedUserConsumedRef.current = requestKey;
          setActiveGroupIndex(requestedIndex);
          setActiveStoryIndex(Math.max(0, requestedStoryIndex));
          setProgressTimer(0);
          // Consumir el deep link: no debe quedar en la URL para reabrir el
          // mismo Estado después de Realtime, AppState o una navegación.
          if (!embedded) router.replace("/(tabs)/stories");
        }
      }
    } catch (err) {
      console.error("Error fetching stories:", err);
      setGroupedStories([]);
      setLoadError(err instanceof Error ? err.message : "No se pudieron cargar los estados.");
    } finally {
      hasLoadedStoriesOnce.current = true;
      setIsLoading(false);
      fetchInFlightRef.current = false;
    }
  }, [embedded, optimisticStories, requestedStoryId, requestedUserId, router, selfAvatarUrl, user]);

  const handleRefresh = useCallback(async () => { setIsRefreshing(true); try { await fetchStories(); } finally { setIsRefreshing(false); } }, [fetchStories]);

  const scheduleStoriesRefresh = useCallback(() => {
    if (refreshTimerRef.current) return;
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      void fetchStories();
    }, 350);
  }, [fetchStories]);

  useEffect(() => {
    void fetchStories();
    if (!user) return;
    const channel = supabase
      .channel(`tragos-sociales-stories-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "stories" }, scheduleStoriesRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "story_reactions" }, scheduleStoriesRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, scheduleStoriesRefresh)
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchStories, revision, scheduleStoriesRefresh, user]);

  useEffect(() => () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = null;
  }, []);

  const pickMedia = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsEditing: true,
        quality: 0.85,
        videoMaxDuration: MAX_STORY_DURATION_SECONDS,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const uri = asset.uri;
        const type = asset.type === "video" ? "video" : "image";
        const durationMs = asset.duration ?? undefined;
        const fileSize = asset.fileSize ?? undefined;
        if (type === "video" && durationMs !== undefined && durationMs > MAX_STORY_DURATION_SECONDS * 1000) {
          Alert.alert("Vídeo demasiado largo", "Máximo 5 minutos (300 segundos). Elige un fragmento más corto antes de subirlo.");
          return;
        }
        if (type === "video" && fileSize !== undefined && fileSize > MAX_STORY_VIDEO_BYTES) {
          Alert.alert("Vídeo demasiado pesado", "El vídeo seleccionado supera el límite de 300 MB.");
          return;
        }
        const filename = uri.split("/").pop() ?? `story_${Date.now()}.${type === "video" ? "mp4" : "jpg"}`;
        const mimeType = type === "video" ? "video/mp4" : "image/jpeg";
        setSelectedMedia({ uri, mimeType, type, name: filename });
        setPreviewMuted(false);
        const durationSeconds = type === "video" && durationMs ? Math.max(1, durationMs / 1000) : 1;
        setVideoDuration(durationSeconds);
        setTrimRange({ start: 0, end: durationSeconds });
      }
    } catch {
      Alert.alert("Error", "No se pudo seleccionar el archivo multimedia.");
    }
  };

  const publishStory = async () => {
    if (!user || !selectedMedia || isUploading) return;
    const media = selectedMedia;
    const selectedPrivacy = privacy;
    const tempStory: StoryItem = {
      id: -Date.now(),
      user_id: user.id,
      media_url: media.uri,
      media_type: media.type,
      audio_url: null,
      audio_name: null,
      caption: caption.trim() || null,
      visibility: selectedPrivacy === "public" ? "public" : "friends",
      privacy: selectedPrivacy,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      user_name: "Mi estado",
      isOptimistic: true,
      trim_start_sec: media.type === "video" ? trimRange.start : 0,
      trim_end_sec: media.type === "video" ? trimRange.end : null,
    };
    setOptimisticStories((previous) => [tempStory, ...previous]);
    setGroupedStories((previous) => {
      const selfIndex = previous.findIndex((group) => group.isSelf);
      if (selfIndex < 0) return [{ userId: user.id, userName: "Mi estado", avatarUrl: selfAvatarUrl, isSelf: true, stories: [tempStory], latestCreatedAt: tempStory.created_at }, ...previous];
      return previous.map((group, index) => index === selfIndex && !group.stories.some((story) => story.id === tempStory.id) ? { ...group, stories: [tempStory, ...group.stories] } : group);
    });
    setSelectedMedia(null);
    setCaption("");
    setPrivacy("all_friends");
    try {
      await enqueue({ userId: user.id, uri: media.uri, mimeType: media.mimeType, type: media.type, caption: tempStory.caption ?? "", privacy: selectedPrivacy, trimStart: media.type === "video" ? trimRange.start : 0, trimEnd: media.type === "video" ? trimRange.end : null });
    } catch (err) {
      setOptimisticStories((previous) => previous.filter((item) => item.id !== tempStory.id));
      setGroupedStories((previous) => previous
        .map((group) => group.isSelf ? { ...group, stories: group.stories.filter((story) => story.id !== tempStory.id) } : group)
        .filter((group) => !group.isSelf || group.stories.length > 0));
      Alert.alert("No se pudo publicar", err instanceof Error ? err.message : "Inténtalo de nuevo.");
    }
  };

  const publishTextStory = async () => {
    const text = textDraft.trim();
    if (!user || !text || isPublishingText) return;
    setIsPublishingText(true);
    try {
      const { error } = await supabase.from("stories").insert({
        user_id: user.id,
        media_url: null,
        media_type: "text",
        text_content: text,
        text_background_color: textBackgroundColor,
        text_font_family: textFontFamily,
        caption: null,
        visibility: privacy === "public" ? "public" : "friends",
        privacy,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
      if (error) throw error;
      setTextDraft("");
      setShowTextCreator(false);
      setPrivacy("all_friends");
      await fetchStories();
    } catch (err) {
      Alert.alert("No se pudo publicar", err instanceof Error ? err.message : "Inténtalo de nuevo.");
    } finally {
      setIsPublishingText(false);
    }
  };

  const recordStoryView = useCallback(async (storyId: number) => {
    if (!user) return;
    const key = `stories-viewed:${user.id}`;
    setViewedStoryIds((current) => {
      const next = new Set(current).add(storyId);
      void AsyncStorage.setItem(key, JSON.stringify([...next]));
      return next;
    });
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
    // La reacción ya genera una actividad/notificación deduplicada en Supabase.
    // No insertamos otro mensaje de chat para evitar inflar el historial.
  };

  const sendQuickReaction = async (emoji: string) => {
    if (!user || !activeGroup || activeGroup.isSelf) return;
    animateQuickReaction(emoji);
    const { error } = await supabase.from("direct_messages").insert({ sender_id: user.id, recipient_id: activeGroup.userId, body: emoji, story_id: activeStory?.id ?? null, kind: "story_quick_reaction" });
    if (error) Alert.alert("No se pudo enviar", "Ejecuta la migración 0020 en Supabase y vuelve a intentarlo.");
  };

  const sendStoryReply = async () => {
    const body = storyReply.trim();
    if (!user || !activeGroup || activeGroup.isSelf || !body) return;
    const { error } = await supabase.from("direct_messages").insert({ sender_id: user.id, recipient_id: activeGroup.userId, body, story_id: activeStory?.id ?? null, kind: "story_reply" });
    if (error) {
      Alert.alert("No se pudo enviar", "Ejecuta la migración 0020 en Supabase y vuelve a intentarlo.");
      return;
    }
    setStoryReply("");
  };

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
            closeStoryViewer();
            await fetchStories();
          } catch (err) {
            Alert.alert("Error", err instanceof Error ? err.message : "No se pudo eliminar.");
          }
        },
      },
    ]);
  };

  const activeGroup = activeGroupIndex !== null ? groupedStories[activeGroupIndex] : null;
  const activeStory = activeGroup ? activeGroup.stories[activeStoryIndex] : null;
  const advanceActiveStory = useCallback(() => {
    if (activeGroupIndex === null) return;
    if (activeStoryIndex < (activeGroup?.stories.length ?? 0) - 1) {
      setActiveStoryIndex((index) => index + 1);
      setProgressTimer(0);
    } else if (activeGroupIndex < groupedStories.length - 1) {
      setActiveGroupIndex((index) => (index !== null ? index + 1 : null));
      setActiveStoryIndex(0);
      setProgressTimer(0);
    } else {
      closeStoryViewer();
    }
  }, [activeGroup?.stories.length, activeGroupIndex, activeStoryIndex, closeStoryViewer, groupedStories.length]);

  // Viewer timer logic
  useEffect(() => {
    if (activeGroupIndex === null || isPaused || showViewers || isStoryMediaLoading || activeStory?.media_type === "video") return;
    const interval = setInterval(() => {
      if (showViewers || isStoryMediaLoading) return;
      setProgressTimer((prev) => {
        if (prev >= 1) {
          advanceActiveStory();
          return 0;
        }
        return prev + 0.02; // ~5 seconds per story item
      });
    }, 100);
    return () => clearInterval(interval);
  }, [activeGroupIndex, activeStory?.media_type, advanceActiveStory, isPaused, isStoryMediaLoading, showViewers]);

  useEffect(() => {
    const storyId = activeStory?.id;
    if (!storyId) return;
    setShowViewers(false);
    const isCachedVideo = activeStory.media_type === "video" && Boolean(activeStory.media_url && resolvedVideoCache.has(activeStory.media_url));
    setIsStoryMediaLoading(activeStory.media_type === "video" && !isCachedVideo);
    setVideoMuted(false);
    videoAdvancedStoryRef.current = null;
    let cancelled = false;
    const loadingFallback = activeStory.media_type === "video"
      ? setTimeout(() => setIsStoryMediaLoading(false), 1500)
      : null;
    if (activeStory.media_type === "image") {
      if (activeStory.media_url) void RNImage.prefetch(activeStory.media_url).finally(() => { if (!cancelled) setIsStoryMediaLoading(false); });
    } else if (activeStory.media_type === "text") {
      setIsStoryMediaLoading(false);
    }
    void loadReaction(storyId);
    if (activeGroup && !activeGroup.isSelf) {
      setViewedStoryIds((current) => new Set(current).add(storyId));
      void recordStoryView(storyId);
    }
    void loadViewerCount(storyId);
    return () => {
      cancelled = true;
      if (loadingFallback) clearTimeout(loadingFallback);
    };
    // El ciclo de carga pertenece a una historia concreta; Realtime puede reemplazar
    // activeStory por otro objeto con el mismo id sin cambiar el contenido visible.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStory?.id]);

  const handleVideoTimeUpdate = useCallback((currentTime: number, duration: number) => {
    if (!activeStory || activeStory.media_type !== "video" || !duration || !Number.isFinite(duration)) return;
    const trimStart = Math.max(0, activeStory.trim_start_sec ?? 0);
    const trimEnd = Math.min(duration, activeStory.trim_end_sec ?? duration);
    const visibleDuration = Math.max(trimEnd - trimStart, 0.1);
    setProgressTimer(Math.min(1, Math.max(0, (currentTime - trimStart) / visibleDuration)));
    if (currentTime >= trimEnd - 0.15 && videoAdvancedStoryRef.current !== activeStory.id) {
      videoAdvancedStoryRef.current = activeStory.id;
      advanceActiveStory();
    }
  }, [activeStory, advanceActiveStory]);

  const handleViewerTouchStart = (event: { nativeEvent: { pageX: number; pageY: number } }) => {
    setIsPaused(true);
    touchStartRef.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY, at: Date.now() };
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => setIsChromeHidden(true), 320);
  };

  const handleViewerTouchEnd = (event?: { nativeEvent: { pageX: number; pageY: number } }) => {
    const start = touchStartRef.current;
    const dy = start && event ? event.nativeEvent.pageY - start.y : 0;
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
    setIsPaused(false);
    setIsChromeHidden(false);
    touchStartRef.current = null;
    if (dy < -80) onSwipeUp();
  };

  const onSwipeUp = () => {
    if (activeGroup?.isSelf && activeStory) void loadViewers(activeStory.id);
  };

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const storyId = activeStory?.id;
    if (!storyId || !user) return;
    const channel = supabase.channel(`story-view-count-${user.id}-${storyId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "story_views", filter: `story_id=eq.${storyId}` }, () => void loadViewerCount(storyId))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [activeStory?.id, loadViewerCount, user]);

  const renderFriendGroup = (group: GroupedStoryUser, muted = false) => {
    const realIndex = groupedStories.findIndex((candidate) => candidate.userId === group.userId);
    return <Pressable key={group.userId} onPress={() => { setActiveGroupIndex(realIndex); setActiveStoryIndex(0); setProgressTimer(0); }} className="flex-row items-center justify-between rounded-2xl border p-3.5 shadow-sm" style={{ backgroundColor: colors.surface, borderColor: `${colors.border}AA`, opacity: muted ? 0.62 : 1 }}>
      <View className="flex-row items-center gap-3">
        <SegmentedStoryRing stories={group.stories} avatarUrl={group.avatarUrl} colors={colors} viewedStoryIds={viewedStoryIds} />
        <View><Text className="text-base font-bold text-foreground">{group.userName}</Text><Text className="text-xs text-muted">{group.stories.length} estado{group.stories.length === 1 ? "" : "s"}</Text></View>
      </View>
      <IconSymbol name="chevron.right" size={18} color={colors.muted} />
    </Pressable>;
  };

  return (
    <ScreenContainer className={embedded ? "flex-1" : "px-5 pt-3"}>
      <ScrollView contentContainerStyle={{ paddingBottom: 48 }} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void handleRefresh()} tintColor={colors.primary} colors={[colors.primary]} />}>
        {!embedded ? <View className="mb-4">
          <Text className="text-2xl font-black text-foreground">Estados</Text>
          <Text className="text-xs text-muted">Comparte momentos que desaparecen en 24 horas</Text>
        </View> : null}

        {/* Mi estado */}
        {(() => {
          const selfGroup = groupedStories.find((group) => group.isSelf);
          const mergedSelfStories = [...optimisticStories, ...(selfGroup?.stories ?? []).filter((story) => !optimisticStories.some((optimistic) => optimistic.id === story.id))];
          return <View className="mb-6 rounded-2xl border p-4 shadow-sm" style={{ backgroundColor: colors.surface, borderColor: `${colors.border}AA` }}>
          <Text className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">Tu Estado</Text>
          {mergedSelfStories.length ? (
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
                <SegmentedStoryRing stories={mergedSelfStories} avatarUrl={selfGroup?.avatarUrl ?? selfAvatarUrl ?? null} colors={colors} viewedStoryIds={viewedStoryIds} />
                <View>
                  <Text className="text-base font-bold text-foreground">Mi estado</Text>
                  <Text className="text-xs text-muted">{isUploading ? uploadMessage || "Enviando actualización…" : "Pulsa para ver tus estados activos"}</Text>
                </View>
              </View>
              <View className="flex-row items-center gap-2">
                <Pressable onPress={() => setShowTextCreator(true)} accessibilityRole="button" accessibilityLabel="Crear estado de texto" className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: colors.background }}><IconSymbol name="pencil" size={19} color={colors.primary} /></Pressable>
                <Pressable onPress={pickMedia} accessibilityRole="button" accessibilityLabel="Añadir un estado" className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: colors.primary }}><IconSymbol name="plus" size={20} color="#FFFFFF" /></Pressable>
              </View>
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
              <View className="flex-row items-center gap-2">
                <Pressable onPress={() => setShowTextCreator(true)} accessibilityRole="button" accessibilityLabel="Crear estado de texto" className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: colors.background }}><IconSymbol name="pencil" size={19} color={colors.primary} /></Pressable>
                <Pressable onPress={pickMedia} accessibilityRole="button" accessibilityLabel="Añadir un estado" className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: colors.primary }}><IconSymbol name="plus" size={20} color="#FFFFFF" /></Pressable>
              </View>
            </Pressable>
          )}
        </View>;
        })()}

        {activeUpload ? (
          <View className="mb-4 rounded-2xl border p-4" style={{ backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}55` }}>
            <Text className="text-sm font-bold text-foreground">{uploadMessage}</Text>
            <Text className="mt-1 text-xs text-muted">Puedes cambiar de pestaña; la publicación continuará.</Text>
          </View>
        ) : failedUpload ? (
          <View className="mb-4 rounded-2xl border p-4" style={{ backgroundColor: `${colors.error}12`, borderColor: `${colors.error}55` }}>
            <Text className="text-sm font-bold text-foreground">No se pudo publicar este Estado</Text>
            <Text className="mt-1 text-xs text-muted">{failedUpload.error || "Inténtalo de nuevo."}</Text>
            <Pressable onPress={() => void retry(failedUpload.id)} className="mt-3 self-start rounded-xl px-4 py-2" style={{ backgroundColor: colors.primary }}>
              <Text className="text-sm font-bold" style={{ color: colors.onPrimary }}>Reintentar</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Actualizaciones recientes */}
        {isLoading ? (
          <View accessibilityLabel="Cargando estados" className="gap-3"><View className="h-20 rounded-2xl" style={{ backgroundColor: `${colors.border}55` }} /><View className="h-20 rounded-2xl" style={{ backgroundColor: `${colors.border}55` }} /></View>
        ) : loadError ? (
          <View className="rounded-2xl border p-6 items-center" style={{ borderColor: `${colors.error}66`, backgroundColor: `${colors.error}12` }}><Text className="text-center text-sm text-foreground">{loadError}</Text><Pressable onPress={() => void handleRefresh()} accessibilityRole="button" accessibilityLabel="Reintentar cargar estados" style={{ minHeight: 44, justifyContent: "center" }}><Text className="font-bold" style={{ color: colors.primary }}>Reintentar</Text></Pressable></View>
        ) : friendGroups.length === 0 ? (
          <View className="rounded-2xl border border-dashed p-8 items-center justify-center" style={{ borderColor: colors.border }}>
            <Text className="text-sm font-medium text-muted text-center">No hay estados recientes de tus amigos.</Text>
          </View>
        ) : (
          <View className="gap-5">
            <View className="gap-3">
              <Text className="text-xs font-bold uppercase tracking-wider text-muted">Actualizaciones recientes</Text>
              {recentFriendGroups.length ? recentFriendGroups.map((group) => renderFriendGroup(group)) : <Text className="text-sm text-muted">Ya viste todas las actualizaciones nuevas.</Text>}
            </View>
            {viewedFriendGroups.length ? <View className="gap-3"><Text className="text-xs font-bold uppercase tracking-wider text-muted">Vistos</Text>{viewedFriendGroups.map((group) => renderFriendGroup(group, true))}</View> : null}
          </View>
        )}
      </ScrollView>

      <Modal visible={showTextCreator} animationType="fade" presentationStyle="fullScreen" onRequestClose={() => setShowTextCreator(false)}>
        <View className="flex-1" style={{ backgroundColor: textBackgroundColor, paddingTop: Math.max(insets.top, 16), paddingBottom: isKeyboardVisible ? keyboardHeight + 8 : Math.max(insets.bottom, 16) }}>
          <View className="flex-row items-center justify-between px-5">
            <Pressable onPress={() => setShowTextCreator(false)} accessibilityRole="button" accessibilityLabel="Volver" style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}><IconSymbol name="chevron.left" size={24} color="#FFFFFF" /></Pressable>
            <View className="flex-row items-center gap-2">
              <Pressable onPress={() => setTextFontFamily((current) => TEXT_STORY_FONTS[(TEXT_STORY_FONTS.indexOf(current) + 1) % TEXT_STORY_FONTS.length])} accessibilityRole="button" accessibilityLabel="Cambiar tipografía" style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: "rgba(0,0,0,0.22)" }}><Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 18 }}>T</Text></Pressable>
              <Pressable onPress={() => setTextBackgroundColor((current) => TEXT_STORY_BACKGROUNDS[(TEXT_STORY_BACKGROUNDS.indexOf(current) + 1) % TEXT_STORY_BACKGROUNDS.length])} accessibilityRole="button" accessibilityLabel="Cambiar color de fondo" style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: "rgba(0,0,0,0.22)" }}><IconSymbol name="photo.fill" size={19} color="#FFFFFF" /></Pressable>
            </View>
          </View>
          <View className="flex-1 items-center justify-center px-8">
            <TextInput value={textDraft} onChangeText={setTextDraft} maxLength={500} multiline autoFocus placeholder="Escribe un estado…" placeholderTextColor="rgba(255,255,255,0.65)" style={{ width: "100%", color: "#FFFFFF", fontFamily: textFontFamily, fontSize: 30, fontWeight: "800", textAlign: "center", maxHeight: 220 }} />
          </View>
          <View className="items-end px-6"><Pressable onPress={() => void publishTextStory()} disabled={!textDraft.trim() || isPublishingText} accessibilityRole="button" accessibilityLabel="Publicar estado de texto" style={{ width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: "#17120E", opacity: textDraft.trim() && !isPublishingText ? 1 : 0.5 }}><IconSymbol name="paperplane.fill" size={22} color="#FFFFFF" /></Pressable></View>
        </View>
      </Modal>

      {/* Modal Compositor Inmersivo Estilo WhatsApp */}
      <Modal visible={Boolean(selectedMedia)} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setSelectedMedia(null)}>
        <View style={{ flex: 1, backgroundColor: "#000000" }}>
          <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" }}>
            {selectedMedia?.type === "image" ? <ExpoImage source={{ uri: selectedMedia.uri }} style={{ width: "100%", height: "100%" }} contentFit="contain" cachePolicy="memory-disk" /> : selectedMedia ? <PreviewVideo uri={selectedMedia.uri} trimStart={trimRange.start} trimEnd={trimRange.end} muted={previewMuted} onDuration={(duration) => { setVideoDuration(duration); setTrimRange((current) => ({ start: Math.min(current.start, Math.max(0, duration - 0.1)), end: Math.min(current.end, duration) })); }} /> : null}
          </View>
          <LinearGradient pointerEvents="none" colors={["rgba(0,0,0,0.62)", "rgba(0,0,0,0)"]} style={{ position: "absolute", top: 0, left: 0, right: 0, height: 180 }} />
          <LinearGradient pointerEvents="none" colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.84)"]} style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 240 }} />
          <View style={{ zIndex: 10, paddingTop: Math.max(insets.top + 8, 20), paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Pressable onPress={() => setSelectedMedia(null)} accessibilityRole="button" accessibilityLabel="Volver" style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" }}><IconSymbol name="chevron.left" size={24} color="#FFFFFF" /></Pressable>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {([["all_friends", "Amigos"], ["close_friends", "Cercanos"], ["public", "Público"]] as const).map(([value, label]) => <Pressable key={value} onPress={() => setPrivacy(value)} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18, backgroundColor: privacy === value ? colors.primary : "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: privacy === value ? colors.primary : "rgba(255,255,255,0.22)" }}><Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "700" }}>{label}</Text></Pressable>)}
            </View>
            {selectedMedia?.type === "video" ? <Pressable onPress={() => setPreviewMuted((muted) => !muted)} accessibilityRole="button" accessibilityLabel={previewMuted ? "Activar sonido de la vista previa" : "Silenciar vista previa"} style={{ width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.5)" }}><IconSymbol name={previewMuted ? "speaker.slash.fill" : "speaker.wave.2.fill"} size={20} color="#FFFFFF" /></Pressable> : <View style={{ width: 42 }} />}
          </View>
          {selectedMedia?.type === "video" ? <View style={{ zIndex: 10, paddingHorizontal: 14 }}><TrimRangeControl duration={videoDuration} range={trimRange} colors={colors} onChange={setTrimRange} /></View> : null}
          <View style={{ zIndex: 10, marginTop: "auto", paddingHorizontal: 14, paddingBottom: isKeyboardVisible ? keyboardHeight + 12 : Math.max(insets.bottom + 12, 24), paddingTop: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
            <TextInput value={caption} onChangeText={setCaption} placeholder="Añade un comentario…" placeholderTextColor="rgba(255,255,255,0.65)" style={{ flex: 1, minHeight: 48, borderRadius: 24, paddingHorizontal: 18, color: "#FFFFFF", fontSize: 15, backgroundColor: "rgba(28,28,30,0.88)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" }} />
            <Pressable onPress={() => void publishStory()} disabled={isUploading} accessibilityRole="button" accessibilityLabel="Publicar estado" style={{ width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, opacity: isUploading ? 0.6 : 1 }}><IconSymbol name="paperplane.fill" size={21} color="#FFFFFF" /></Pressable>
          </View>
        </View>
      </Modal>

      {/* Visor Inmersivo Estilo WhatsApp */}
      <Modal visible={activeGroup !== null && activeStory !== null} animationType="fade" transparent onRequestClose={closeStoryViewer}>
        {activeGroup && activeStory ? (
          <Animated.View onTouchStart={handleViewerTouchStart} onTouchEnd={handleViewerTouchEnd} onTouchCancel={handleViewerTouchEnd} style={[{ flex: 1, position: "relative", backgroundColor: "#000000" }, { transform: [{ perspective: 900 }, { rotateY: profileTransition.interpolate({ inputRange: [-1, 0, 1], outputRange: ["-90deg", "0deg", "90deg"] }) }] }]}>
            <LinearGradient pointerEvents="none" colors={["rgba(0,0,0,0.72)", "rgba(0,0,0,0)"]} locations={[0, 1]} style={{ position: "absolute", top: 0, left: 0, right: 0, height: 170, zIndex: 2 }} />
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
                    <ExpoImage source={{ uri: activeGroup.avatarUrl }} style={{ width: 38, height: 38, borderRadius: 19 }} contentFit="cover" cachePolicy="memory-disk" />
                  ) : (
                    <Text style={{ color: "#FFFFFF", fontWeight: "800" }}>{activeGroup.userName[0]?.toUpperCase() ?? "?"}</Text>
                  )}
                </View>
                <View>
                  <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "800" }}>{activeGroup.userName}</Text>
                  <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 11 }}>{storyAgeById.get(activeStory.id) ?? formatStoryAge(activeStory.created_at)}</Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                {activeStory.media_type === "video" ? <Pressable onPress={() => setVideoMuted((muted) => !muted)} hitSlop={8} accessibilityRole="button" accessibilityLabel={videoMuted ? "Activar sonido" : "Silenciar vídeo"} style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}><IconSymbol name={videoMuted ? "speaker.slash.fill" : "speaker.wave.2.fill"} size={20} color="#FFFFFF" /></Pressable> : null}
                {activeGroup.isSelf ? (
                  <Pressable onPress={() => void deleteStory(activeStory.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Eliminar estado" style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}>
                    <IconSymbol name="trash.fill" size={20} color="#FF6B6B" />
                  </Pressable>
                ) : null}
              </View>
            </View> : null}

            <View pointerEvents="none" style={{ position: "absolute", inset: 0, zIndex: 1, alignItems: "center", justifyContent: "center" }}>
              {activeStory.media_type === "video" && activeStory.media_url ? <StoryVideo key={`story-video-${activeStory.id}`} uri={activeStory.media_url} muted={videoMuted} paused={isPaused || showViewers} trimStart={activeStory.trim_start_sec ?? 0} trimEnd={activeStory.trim_end_sec} onReady={() => setIsStoryMediaLoading(false)} onTimeUpdate={handleVideoTimeUpdate} /> : activeStory.media_type === "text" ? <View style={{ width: "100%", height: "100%", alignItems: "center", justifyContent: "center", padding: 32, backgroundColor: activeStory.text_background_color || colors.primary }}><Text style={{ color: "#FFFFFF", fontFamily: activeStory.text_font_family || "System", fontSize: 30, fontWeight: "800", textAlign: "center" }}>{activeStory.text_content}</Text></View> : activeStory.media_url ? <ExpoImage source={{ uri: activeStory.media_url }} style={{ width: "100%", height: "100%" }} contentFit="contain" cachePolicy="memory-disk" transition={120} onLoad={() => setIsStoryMediaLoading(false)} onError={() => setIsStoryMediaLoading(false)} /> : null}
              {isStoryMediaLoading ? <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.22)" }}><View style={{ width: "72%", height: "58%", borderRadius: 18, backgroundColor: "rgba(255,255,255,0.08)" }} /><ActivityIndicator color="#FFFFFF" size="large" style={{ position: "absolute" }} /></View> : null}
            </View>

            <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: 120, alignItems: "center", zIndex: 5 }}>
              {flyingEmojis.map((item) => <Animated.Text key={item.id} style={{ position: "absolute", fontSize: 34, transform: [{ translateY: item.translateY }], opacity: item.opacity }}>{item.emoji}</Animated.Text>)}
            </View>

            <View style={{ position: "absolute", top: 115, bottom: 150, left: 0, right: 0, zIndex: 2, flexDirection: "row" }}>
              <Pressable
                onTouchStart={(event) => { setIsPaused(true); touchStartRef.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY, at: Date.now() }; }}
                onTouchEnd={(event) => {
                  setIsPaused(false);
                  const start = touchStartRef.current;
                  touchStartRef.current = null;
                  if (!start) return;
                  const dx = event.nativeEvent.pageX - start.x;
                  const dy = event.nativeEvent.pageY - start.y;
                  if (dy < -80) { onSwipeUp(); return; }
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
                  if (dy < -80) { onSwipeUp(); return; }
                  const isShortTap = Date.now() - start.at < 300 && Math.abs(dx) < 24 && Math.abs(dy) < 24;
                  if ((dx < -60 && Math.abs(dx) > Math.abs(dy)) || isShortTap) {
                    if (activeStoryIndex < activeGroup.stories.length - 1) { setActiveStoryIndex((index) => index + 1); setProgressTimer(0); }
                    else if (activeGroupIndex !== null && activeGroupIndex < groupedStories.length - 1) { setActiveGroupIndex((index) => (index !== null ? index + 1 : null)); setActiveStoryIndex(0); setProgressTimer(0); }
                    else closeStoryViewer();
                  }
                }}
                style={{ flex: 1 }}
              />
            </View>

            {!isChromeHidden ? <View style={{ position: "absolute", left: 16, right: 16, bottom: isKeyboardVisible ? keyboardHeight + 8 : Math.max(insets.bottom + 12, 28), zIndex: 4 }}>
              {activeStory.caption ? <Text style={{ marginBottom: 12, paddingHorizontal: 14, color: "#FFFFFF", textAlign: "center", fontSize: 14, fontWeight: "600" }}>{activeStory.caption}</Text> : null}
              {activeGroup.isSelf ? (
                <Pressable onPress={(event) => { stopEventPropagation(event); void loadViewers(activeStory.id); }} accessibilityRole="button" accessibilityLabel="Ver quién vio este estado" style={{ minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 24, paddingHorizontal: 18, backgroundColor: "rgba(0,0,0,0.68)" }}>
                  <IconSymbol name="eye" size={17} color="#FFFFFF" />
                  <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "800" }}>Visto por {viewerCountByStory[activeStory.id] ?? viewers.length} personas</Text>
                </Pressable>
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={{ flex: 1, minHeight: 46, flexDirection: "row", alignItems: "center", borderRadius: 24, paddingLeft: 14, paddingRight: 6, backgroundColor: "rgba(0,0,0,0.68)" }}>
                    <TextInput value={storyReply} onChangeText={setStoryReply} placeholder="Responder" placeholderTextColor="rgba(255,255,255,0.65)" style={{ flex: 1, minHeight: 40, color: "#FFFFFF", fontSize: 14 }} returnKeyType="send" onFocus={() => setIsPaused(true)} onBlur={() => setIsPaused(false)} onSubmitEditing={() => void sendStoryReply()} />
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 1 }}>
                      {["😍", "😂", "😮"].map((emoji) => <Pressable key={emoji} onPress={(event) => { stopEventPropagation(event); void sendQuickReaction(emoji); }} hitSlop={5} style={{ padding: 5 }}><Text style={{ fontSize: 19 }}>{emoji}</Text></Pressable>)}
                    </View>
                  </View>
                  <Pressable onPress={(event) => { stopEventPropagation(event); void toggleReaction(activeStory.id, "❤️"); }} style={{ width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: reactionByStory[activeStory.id] === "❤️" ? "#2F80ED" : "rgba(0,0,0,0.68)" }}>
                    <IconSymbol name="heart.fill" size={21} color="#FFFFFF" />
                  </Pressable>
                </View>
              )}
            </View> : null}
          </Animated.View>
        ) : null}
      </Modal>

      <Modal visible={showViewers} transparent animationType="slide" onRequestClose={closeViewers}>
        <View className="flex-1 justify-end">
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar vistas del Estado" onPress={closeViewers} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)" }} />
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
                    <ExpoImage source={{ uri: viewer.avatar_url }} style={{ width: 40, height: 40, borderRadius: 20 }} className="h-10 w-10 rounded-full" contentFit="cover" cachePolicy="memory-disk" />
                  ) : (
                    <View className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: colors.primary }}>
                      <Text className="font-bold text-white">{viewer.name[0]?.toUpperCase() ?? "?"}</Text>
                    </View>
                  )}
                  <View className="flex-1">
                    <Text className="text-sm font-bold text-foreground">{viewer.name}</Text>
                    <Text className="text-xs text-muted">{formatStoryAge(viewer.viewed_at)}</Text>
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
