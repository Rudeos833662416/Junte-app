import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { supabase } from "@/lib/supabase";
import { uploadUriToStorage, verifyPublicStorageUrl } from "@/lib/media-upload";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { searchPlacesByAddress } from "@/lib/openstreetmap";
import { Image as ExpoImage } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Share, Text, TextInput, View, useWindowDimensions, type ViewToken } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Venue = {
  id: number;
  name: string;
  address: string | null;
  description: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  admin_rank: number | null;
  admin_photo_url: string | null;
};

type OfficialPost = {
  id: string;
  media_url: string;
  media_type: "image" | "video";
  caption: string | null;
  created_at: string;
  created_by: string;
  media_width: number | null;
  media_height: number | null;
  likeCount: number;
  commentCount: number;
  liked: boolean;
  authorName: string;
  authorAvatarUrl: string | null;
};

type OfficialAuthor = { id: string; name: string | null; username: string | null; avatar_url: string | null };

type CommentRow = { id: string; body: string; created_at: string; user_id: string; name: string; avatar_url: string | null; parent_comment_id: string | null; reactionCount: number; reacted: boolean };

type FullMedia = { uri: string; isVideo: boolean; aspectRatio?: number };

function OfficialVideo({ uri, aspectRatio = 9 / 16, fullscreen = false, isVisible = true, onOpenFullscreen }: { uri: string; aspectRatio?: number; fullscreen?: boolean; isVisible?: boolean; onOpenFullscreen: () => void }) {
  const player = useVideoPlayer(uri, (videoPlayer) => {
    videoPlayer.loop = false;
  });
  const [muted, setMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(isVisible);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [videoWidth, setVideoWidth] = useState(0);
  const lastTapRef = useRef(0);
  const hideControlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (isVisible) { player.play(); setIsPlaying(true); }
    else { player.pause(); setIsPlaying(false); }
  }, [isVisible, player]);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    if (isPlaying) {
      hideControlsTimerRef.current = setTimeout(() => setControlsVisible(false), 1800);
    }
  }, [isPlaying]);

  useEffect(() => () => {
    if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
  }, []);

  const handleSurfaceTap = (event: { nativeEvent: { locationX: number } }) => {
    const now = Date.now();
    const delta = now - lastTapRef.current;
    const locationX = event.nativeEvent.locationX;
    lastTapRef.current = now;
    revealControls();
    if (delta < 280 && videoWidth > 0 && (locationX < videoWidth * 0.3 || locationX > videoWidth * 0.7)) {
      const direction = locationX < videoWidth * 0.3 ? -1 : 1;
      player.currentTime = Math.max(0, player.currentTime + direction * 10);
      return;
    }
    if (fullscreen) return;
    if (isPlaying) player.pause(); else player.play();
    setIsPlaying((current) => !current);
  };

  return (
    <View onLayout={(event) => setVideoWidth(event.nativeEvent.layout.width)} style={{ width: "100%", aspectRatio, alignItems: "center", justifyContent: "center", backgroundColor: "#05070C" }}>
      <Pressable style={{ flex: 1, width: "100%" }} onPress={handleSurfaceTap}>
        <VideoView player={player} style={{ flex: 1, width: "100%" }} contentFit="contain" nativeControls={fullscreen} allowsFullscreen={fullscreen} />
      </Pressable>
      {controlsVisible ? <>
        {!fullscreen ? <Pressable onPress={onOpenFullscreen} style={{ position: "absolute", right: 58, top: 12, width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.72)" }}><MaterialIcons name="fullscreen" size={20} color="#FFFFFF" /></Pressable> : null}
        <Pressable onPress={() => { const next = !muted; player.muted = next; setMuted(next); revealControls(); }} style={{ position: "absolute", right: 12, top: 12, width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.72)" }}>
          <MaterialIcons name={muted ? "volume-off" : "volume-up"} size={20} color="#FFFFFF" />
        </Pressable>
      </> : null}
    </View>
  );
}

const rankColors = ["#F4C542", "#C9D1D9", "#B8794A", "#3B82F6", "#A855F7"];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-VE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
}

export default function EventsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user } = useAuth({ autoFetch: true });
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [posts, setPosts] = useState<OfficialPost[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [commentFor, setCommentFor] = useState<string | null>(null);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [comment, setComment] = useState("");
  const [replyingTo, setReplyingTo] = useState<CommentRow | null>(null);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [adminVisible, setAdminVisible] = useState(false);
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [adminVenueName, setAdminVenueName] = useState("");
  const [adminVenueAddress, setAdminVenueAddress] = useState("");
  const [adminVenueDescription, setAdminVenueDescription] = useState("");
  const [adminRank, setAdminRank] = useState("1");
  const [adminVenuePhotoUri, setAdminVenuePhotoUri] = useState<string | null>(null);
  const [venuePhotoRotation, setVenuePhotoRotation] = useState(0);
  const [postCaption, setPostCaption] = useState("");
  const [posting, setPosting] = useState(false);
  const [savingVenue, setSavingVenue] = useState(false);
  const [showTopEditor, setShowTopEditor] = useState(false);
  const [mediaRatio, setMediaRatio] = useState<Record<string, number>>({});
  const [fullMedia, setFullMedia] = useState<FullMedia | null>(null);
  const [visiblePostIds, setVisiblePostIds] = useState<Set<string>>(new Set());
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);
  const loadVersionRef = useRef(0);
  const deletedPostIdsRef = useRef(new Set<string>());
  const commentForRef = useRef<string | null>(null);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 55, minimumViewTime: 120 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    setVisiblePostIds(new Set(viewableItems.map((item) => String(item.item?.id ?? ""))));
  }).current;

  const featuredVenues = useMemo(() => venues.filter((venue) => venue.admin_rank).sort((a, b) => (a.admin_rank ?? 99) - (b.admin_rank ?? 99)).slice(0, 5), [venues]);

  useEffect(() => {
    commentForRef.current = commentFor;
  }, [commentFor]);

  const loadData = useCallback(async () => {
    if (!user) return;
    const loadVersion = ++loadVersionRef.current;
    if (!hasLoadedRef.current) setLoading(true);
    const [{ data: venueRows }, { data: postRows, error: postsError }, { data: adminRow }] = await Promise.all([
      supabase.from("venues").select("id, name, address, description, city, latitude, longitude, admin_rank, admin_photo_url").not("admin_rank", "is", null).order("admin_rank", { ascending: true }).limit(5),
      supabase.from("official_posts").select("id, media_url, media_type, caption, created_at, created_by, media_width, media_height").is("deleted_at", null).order("created_at", { ascending: false }).limit(50),
      supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle(),
    ]);
    if (postsError) throw postsError;
    const rawPosts = ((postRows ?? []) as Omit<OfficialPost, "likeCount" | "commentCount" | "liked" | "authorName" | "authorAvatarUrl">[])
      .filter((post) => !deletedPostIdsRef.current.has(post.id));
    const authorIds = [...new Set(rawPosts.map((post) => post.created_by))];
    let authorRows: OfficialAuthor[] = [];
    if (authorIds.length) {
          const authorResult = await supabase.rpc("get_official_post_authors", { p_post_ids: authorIds });
      if (!authorResult.error) {
        authorRows = (authorResult.data ?? []) as OfficialAuthor[];
      } else {
        console.warn("No se pudo cargar la autoría oficial segura; usando compatibilidad:", authorResult.error.message);
        const fallback = await supabase.from("profiles").select("id, name, username, avatar_url").in("id", authorIds);
        authorRows = (fallback.data ?? []) as OfficialAuthor[];
      }
    }
    const authorMap = new Map<string, OfficialAuthor>();
    for (const profile of authorRows) authorMap.set(profile.id, profile);
    const postsWithCounts = await Promise.all(rawPosts.map(async (post) => {
      const [{ count: likeCount }, { count: commentCount }, { data: ownLike }] = await Promise.all([
        supabase.from("official_post_likes").select("post_id", { count: "exact", head: true }).eq("post_id", post.id),
        supabase.from("official_post_comments").select("id", { count: "exact", head: true }).eq("post_id", post.id),
        supabase.from("official_post_likes").select("post_id").eq("post_id", post.id).eq("user_id", user.id).maybeSingle(),
      ]);
      const author = authorMap.get(post.created_by);
      return { ...post, likeCount: likeCount ?? 0, commentCount: commentCount ?? 0, liked: Boolean(ownLike), authorName: author?.name?.trim() || author?.username?.trim() || "Tragos Sociales Oficial", authorAvatarUrl: author?.avatar_url ?? null };
    }));
    if (loadVersion !== loadVersionRef.current) return;
    setVenues((venueRows ?? []) as Venue[]);
    setPosts(postsWithCounts);
    setIsAdmin(Boolean(adminRow?.is_admin));
    hasLoadedRef.current = true;
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void loadData();
    if (!user) return;
    const channel = supabase.channel(`events-official-${user.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "venues" }, () => void loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "official_posts" }, (payload) => {
        const row = (payload.new ?? payload.old) as { id?: string; deleted_at?: string | null };
        if ((payload.eventType === "DELETE" || row.deleted_at) && row.id) {
          deletedPostIdsRef.current.add(row.id);
          setPosts((current) => current.filter((post) => post.id !== row.id));
          setVisiblePostIds((current) => { const next = new Set(current); next.delete(row.id as string); return next; });
          return;
        }
        void loadData();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "official_post_likes" }, (payload) => {
        const row = payload.new as { post_id?: string; user_id?: string };
        if (row.user_id === user.id) return;
        setPosts((current) => current.map((post) => post.id === row.post_id ? { ...post, likeCount: post.likeCount + 1 } : post));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "official_post_likes" }, (payload) => {
        const row = payload.old as { post_id?: string; user_id?: string };
        if (row.user_id === user.id) return;
        setPosts((current) => current.map((post) => post.id === row.post_id ? { ...post, likeCount: Math.max(0, post.likeCount - 1) } : post));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "official_post_comments" }, (payload) => {
        const row = (payload.new ?? payload.old) as { post_id?: string };
        setPosts((current) => current.map((post) => post.id === row.post_id ? { ...post, commentCount: post.commentCount + (payload.eventType === "INSERT" ? 1 : payload.eventType === "DELETE" ? -1 : 0) } : post));
        if (commentForRef.current === row.post_id) void loadComments(row.post_id);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [loadData, user]);

  const loadComments = useCallback(async (postId: string) => {
    setCommentsLoading(true);
    try {
      let query = supabase.from("official_post_comments").select("id, body, created_at, user_id, parent_comment_id").eq("post_id", postId).order("created_at", { ascending: true });
      let { data, error } = await query;
      // A project that has not reloaded PostgREST's schema cache may reject the
      // new column even after the SQL migration ran. Keep comments readable in
      // that case and treat the legacy rows as top-level comments.
      if (error && /parent_comment_id|schema cache/i.test(error.message)) {
        const fallback = await supabase.from("official_post_comments").select("id, body, created_at, user_id").eq("post_id", postId).order("created_at", { ascending: true });
        data = (fallback.data ?? []).map((row) => ({ ...row, parent_comment_id: null }));
        error = fallback.error;
      }
      if (error) throw error;
      const rows = (data ?? []) as { id: string; body: string; created_at: string; user_id: string; parent_comment_id: string | null }[];
      const ids = [...new Set(rows.map((row) => row.user_id))];
      const { data: profiles } = ids.length ? await supabase.from("profiles").select("id, name, avatar_url").in("id", ids) : { data: [] };
      const { data: reactions } = rows.length ? await supabase.from("official_post_comment_reactions").select("comment_id, user_id").in("comment_id", rows.map((row) => row.id)) : { data: [] };
      const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
      const reactionMap = new Map<string, { count: number; reacted: boolean }>();
      (reactions ?? []).forEach((reaction) => { const current = reactionMap.get(reaction.comment_id) ?? { count: 0, reacted: false }; current.count += 1; current.reacted = current.reacted || reaction.user_id === user?.id; reactionMap.set(reaction.comment_id, current); });
      setComments(rows.map((row) => ({ ...row, name: profileMap.get(row.user_id)?.name?.trim() || "Usuario", avatar_url: profileMap.get(row.user_id)?.avatar_url ?? null, reactionCount: reactionMap.get(row.id)?.count ?? 0, reacted: reactionMap.get(row.id)?.reacted ?? false })));
    } catch (error) {
      console.error("No se pudieron cargar los comentarios:", error);
      setComments([]);
    } finally {
      setCommentsLoading(false);
    }
  }, [user]);

  const toggleCommentReaction = async (item: CommentRow) => {
    if (!user) return;
    setComments((current) => current.map((commentItem) => commentItem.id === item.id ? { ...commentItem, reacted: !commentItem.reacted, reactionCount: Math.max(0, commentItem.reactionCount + (commentItem.reacted ? -1 : 1)) } : commentItem));
    const result = item.reacted ? await supabase.from("official_post_comment_reactions").delete().eq("comment_id", item.id).eq("user_id", user.id) : await supabase.from("official_post_comment_reactions").upsert({ comment_id: item.id, user_id: user.id, reaction: "heart" });
    if (result.error && commentFor) void loadComments(commentFor);
  };

  const openComments = (postId: string) => { setCommentFor(postId); void loadComments(postId); };

  const goToVenue = (venue: Venue) => {
    if (venue.latitude == null || venue.longitude == null) { Alert.alert("Ubicación no disponible", "Este local todavía no tiene coordenadas registradas."); return; }
    router.push(`/(tabs)/map?focusLat=${venue.latitude}&focusLng=${venue.longitude}&focusName=${encodeURIComponent(venue.name)}`);
  };

  const toggleLike = async (post: OfficialPost) => {
    if (!user) return;
    setPosts((current) => current.map((item) => item.id === post.id ? { ...item, liked: !item.liked, likeCount: Math.max(0, item.likeCount + (item.liked ? -1 : 1)) } : item));
    const result = post.liked ? await supabase.from("official_post_likes").delete().eq("post_id", post.id).eq("user_id", user.id) : await supabase.from("official_post_likes").upsert({ post_id: post.id, user_id: user.id });
    if (result.error) { Alert.alert("No se pudo actualizar el Me gusta", result.error.message); await loadData(); }
  };

  const submitComment = async () => {
    if (!user || !commentFor || !comment.trim()) return;
    const body = comment.trim();
    setComment("");
    let { error } = await supabase.from("official_post_comments").insert({ post_id: commentFor, user_id: user.id, body, parent_comment_id: replyingTo?.id ?? null });
    if (error && error.message.toLowerCase().includes("parent_comment_id")) {
      const fallback = await supabase.from("official_post_comments").insert({ post_id: commentFor, user_id: user.id, body });
      error = fallback.error;
    }
    if (error) { setComment(body); Alert.alert("No se pudo comentar", error.message); } else { setReplyingTo(null); await loadComments(commentFor); }
  };

  const sharePost = async (post: OfficialPost) => {
    await Share.share({ message: `Tragos Sociales${post.caption ? `: ${post.caption}` : ""}\n${post.media_url}` });
    if (user) await supabase.from("official_post_shares").upsert({ post_id: post.id, user_id: user.id });
  };

  const chooseImage = async () => ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.95, allowsEditing: true, aspect: [4, 3], selectionLimit: 1 });

  const pickAdminMedia = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], quality: 0.95, allowsEditing: false, selectionLimit: 1 });
    if (result.canceled || !result.assets[0] || !user) return;
    try {
      setPosting(true);
      const asset = result.assets[0];
      const mime = asset.mimeType || (asset.type === "video" ? "video/mp4" : "image/jpeg");
      const extension = mime.split("/")[1] || "bin";
      const path = `${user.id}/${Date.now()}.${extension}`;
      await uploadUriToStorage("official-feed", path, asset.uri, mime);
      const mediaUrl = await verifyPublicStorageUrl("official-feed", path, asset.type === "video" ? "video" : "image");
      const { error } = await supabase.from("official_posts").insert({ created_by: user.id, media_url: mediaUrl, media_type: asset.type === "video" ? "video" : "image", media_width: asset.width ?? null, media_height: asset.height ?? null, caption: postCaption.trim() || null });
      if (error) throw error;
      setPostCaption("");
      Alert.alert("Publicado", "La publicación oficial ya está disponible.");
      await loadData();
    } catch (error) { Alert.alert("No se pudo publicar", error instanceof Error ? error.message : "Revisa Storage y tus permisos."); }
    finally { setPosting(false); }
  };

  const startCreateVenue = () => {
    setSelectedVenue({ id: -1, name: "", address: null, description: null, city: null, latitude: null, longitude: null, admin_rank: featuredVenues.length < 5 ? featuredVenues.length + 1 : 1, admin_photo_url: null });
    setAdminVenueName("");
    setAdminVenueAddress("");
    setAdminVenueDescription("");
    setAdminRank(String(featuredVenues.length < 5 ? featuredVenues.length + 1 : 1));
    setAdminVenuePhotoUri(null);
  };

  const selectVenue = (venue: Venue) => {
    setSelectedVenue(venue);
    setAdminVenueName(venue.name);
    setAdminVenueAddress(venue.address || "");
    setAdminVenueDescription(venue.description || "");
    setAdminRank(String(venue.admin_rank || 1));
    setAdminVenuePhotoUri(null);
  };

  const pickVenuePhoto = async () => {
    const result = await chooseImage();
    if (!result.canceled && result.assets[0]) {
      setAdminVenuePhotoUri(result.assets[0].uri);
      setVenuePhotoRotation(0);
    }
  };

  const rotateVenuePhoto = async () => {
    if (!adminVenuePhotoUri) return;
    const rotated = await ImageManipulator.manipulateAsync(adminVenuePhotoUri, [{ rotate: 90 }], { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG });
    setAdminVenuePhotoUri(rotated.uri);
    setVenuePhotoRotation((value) => (value + 90) % 360);
  };

  const saveVenue = async () => {
    if (!selectedVenue || !adminVenueName.trim() || !user) return;
    const rank = Number(adminRank);
    if (!Number.isInteger(rank) || rank < 1 || rank > 5) { Alert.alert("Posición inválida", "Usa una posición del 1 al 5."); return; }
    try {
      setSavingVenue(true);
      let photoUrl = selectedVenue.admin_photo_url;
      if (adminVenuePhotoUri) {
        const path = `${user.id}/venue-${selectedVenue.id}-${Date.now()}.jpg`;
        await uploadUriToStorage("venue-assets", path, adminVenuePhotoUri, "image/jpeg");
        photoUrl = await verifyPublicStorageUrl("venue-assets", path, "image");
      }
      const address = adminVenueAddress.trim() || null;
      let place: Awaited<ReturnType<typeof searchPlacesByAddress>>[number] | undefined;
      if (address && address.length >= 3) {
        try {
          place = (await searchPlacesByAddress(address))[0];
        } catch {
          place = undefined;
        }
      }
      const latitude = place?.latitude ?? selectedVenue.latitude ?? null;
      const longitude = place?.longitude ?? selectedVenue.longitude ?? null;
      const city = place?.city ?? selectedVenue.city ?? null;
      const { data: rankedRows, error: rankedError } = await supabase.from("venues").select("id, admin_rank").not("admin_rank", "is", null).order("admin_rank", { ascending: true });
      if (rankedError) throw rankedError;
      const movingId = selectedVenue.id === -1 ? null : selectedVenue.id;
      const ordered = (rankedRows ?? []).filter((row) => row.id !== movingId).sort((a, b) => (a.admin_rank ?? 99) - (b.admin_rank ?? 99)).map((row) => row.id as number);
      ordered.splice(Math.min(rank - 1, ordered.length), 0, movingId ?? -1);
      const finalOrder = ordered.slice(0, 5);
      const existingIds = (rankedRows ?? []).map((row) => row.id as number);
      if (existingIds.length) {
        const { error } = await supabase.from("venues").update({ admin_rank: null }).in("id", existingIds);
        if (error) throw error;
      }
      const payload = { name: adminVenueName.trim(), address, description: adminVenueDescription.trim() || null, admin_rank: null, admin_photo_url: photoUrl, city, latitude, longitude };
      let savedId = movingId;
      if (savedId == null) {
        const { data, error } = await supabase.from("venues").insert(payload).select("id").single();
        if (error) throw error;
        savedId = data.id as number;
        finalOrder[finalOrder.indexOf(-1)] = data.id as number;
      } else {
        const { error } = await supabase.from("venues").update(payload).eq("id", savedId);
        if (error) throw error;
      }
      for (const [index, venueId] of finalOrder.entries()) {
        const { error } = await supabase.from("venues").update({ admin_rank: index + 1 }).eq("id", venueId);
        if (error) throw error;
      }
      setSelectedVenue(null);
      await loadData();
    } catch (error) { Alert.alert("No se pudo guardar", error instanceof Error ? error.message : "Revisa la dirección y los permisos de administrador."); }
    finally { setSavingVenue(false); }
  };

  const deletePost = async (post: OfficialPost) => {
    Alert.alert("Eliminar publicación", "¿Quieres eliminar esta publicación oficial?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: () => void (async () => {
        const previousPosts = posts;
        deletedPostIdsRef.current.add(post.id);
        setDeletingPostId(post.id);
        if (fullMedia?.uri === post.media_url) setFullMedia(null);
        setVisiblePostIds((current) => { const next = new Set(current); next.delete(post.id); return next; });
        setPosts((current) => current.filter((item) => item.id !== post.id));
        try {
          const { data: deleted, error } = await supabase.rpc("admin_soft_delete_official_post", { p_post_id: post.id });
          if (error) throw new Error(`${error.message} [${error.code ?? "sin código"}]`);
          if (!deleted) throw new Error("La cuenta actual no tiene permisos de administrador para eliminar esta publicación.");
          const storageMatch = post.media_url.match(/\/storage\/v1\/object\/public\/official-feed\/([^?]+)/);
          if (storageMatch) {
            const { error: storageError } = await supabase.storage.from("official-feed").remove([decodeURIComponent(storageMatch[1])]);
            if (storageError) console.warn("No se pudo limpiar el archivo multimedia eliminado:", storageError.message);
          }
        } catch (error) {
          deletedPostIdsRef.current.delete(post.id);
          setPosts(previousPosts);
          console.error("Error exacto al eliminar publicación oficial:", error);
          Alert.alert("No se pudo eliminar", error instanceof Error ? error.message : "Inténtalo de nuevo.");
        } finally {
          setDeletingPostId(null);
        }
      })() },
    ]);
  };

  const renderMedia = (post: OfficialPost) => {
    const aspectRatio = post.media_width && post.media_height ? post.media_width / post.media_height : post.media_type === "video" ? 9 / 16 : 4 / 3;
    if (post.media_type === "video") {
      if (fullMedia?.isVideo && fullMedia.uri === post.media_url) {
        return <View style={{ width: "100%", aspectRatio, backgroundColor: "#05070C" }} />;
      }
      return (
        <OfficialVideo
          uri={post.media_url}
          aspectRatio={aspectRatio}
          isVisible={visiblePostIds.has(post.id) && !fullMedia}
          onOpenFullscreen={() => setFullMedia({ uri: post.media_url, isVideo: true, aspectRatio })}
        />
      );
    }
    const ratio = mediaRatio[post.id] || aspectRatio;
    return (
      <Pressable onPress={() => setFullMedia({ uri: post.media_url, isVideo: false })} style={{ backgroundColor: "#05070C" }}>
        <ExpoImage
          source={{ uri: post.media_url }}
          style={{ width: "100%", aspectRatio: ratio, backgroundColor: "#05070C" }}
          contentFit="cover"
          onLoad={(event) => {
            const source = event.source as { width?: number; height?: number };
            if (source.width && source.height) setMediaRatio((current) => ({ ...current, [post.id]: source.width! / source.height! }));
          }}
        />
      </Pressable>
    );
  };

  return (
    <ScreenContainer className="px-5 pt-3">
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        ListHeaderComponent={
          <View>
            <View className="mb-5 flex-row items-center justify-between">
              <View>
                <Text className="text-3xl font-black text-foreground">Eventos</Text>
                <Text className="mt-1 text-sm text-muted">Los lugares que están marcando la noche</Text>
              </View>
              {isAdmin ? (
                <Pressable onPress={() => setAdminVisible(true)} className="rounded-full px-3 py-2" style={{ backgroundColor: colors.primary + "18" }}>
                  <Text className="text-xs font-black" style={{ color: colors.primary }}>ADMIN</Text>
                </Pressable>
              ) : null}
            </View>
            <Text className="mb-3 text-xs font-black uppercase tracking-widest text-muted">Top 5 bares y discotecas</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 8 }}>
              {featuredVenues.map((venue) => {
                const rank = (venue.admin_rank ?? 1) - 1;
                return (
                  <View key={venue.id} className="w-72 overflow-hidden rounded-3xl border" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
                    <View className="h-36 overflow-hidden bg-black">
                      {venue.admin_photo_url ? (
                        <Pressable onPress={() => setFullMedia({ uri: venue.admin_photo_url!, isVideo: false })} style={{ flex: 1 }}>
                          <ExpoImage source={{ uri: venue.admin_photo_url }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                        </Pressable>
                      ) : (
                        <View className="flex-1 items-center justify-center"><MaterialIcons name="nightlife" size={42} color={colors.primary} /></View>
                      )}
                      <View className="absolute left-3 top-3 h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: "rgba(0,0,0,0.62)" }}>
                        <MaterialIcons name="star" size={23} color={rankColors[rank] ?? colors.primary} />
                      </View>
                    </View>
                    <View className="p-4">
                      <Text className="text-base font-black text-foreground">{venue.name}</Text>
                      <Text className="mt-1 text-xs leading-5 text-muted" numberOfLines={2}>{venue.address || venue.city || "Dirección por confirmar"}</Text>
                      {venue.description ? <Text className="mt-1 text-xs leading-5 text-muted" numberOfLines={2}>{venue.description}</Text> : null}
                      <Pressable onPress={() => goToVenue(venue)} className="mt-3 min-h-10 items-center justify-center rounded-xl" style={{ backgroundColor: colors.primary }}>
                        <Text className="font-black text-white">Ir</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
              {!loading && featuredVenues.length === 0 ? <View className="w-72 rounded-3xl border p-6" style={{ borderColor: colors.border }}><Text className="text-sm text-muted">El administrador todavía no ha configurado el Top 5.</Text></View> : null}
            </ScrollView>
            <View className="mb-3 mt-7 flex-row items-center justify-between">
              <Text className="text-xs font-black uppercase tracking-widest text-muted">Tragos Sociales</Text>
              <MaterialIcons name="verified" size={18} color={colors.primary} />
            </View>
          </View>
        }
        ListEmptyComponent={
          loading ? <ActivityIndicator color={colors.primary} /> : <View className="rounded-3xl border p-8" style={{ borderColor: colors.border }}><Text className="text-center text-sm text-muted">Pronto habrá novedades oficiales.</Text></View>
        }
        renderItem={({ item: post }) => (
          <View className="mb-5 overflow-hidden rounded-3xl border" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
            {renderMedia(post)}
            <View className="p-4">
              <View className="flex-row items-center gap-3">
                {post.authorAvatarUrl ? (
                  <ExpoImage source={{ uri: post.authorAvatarUrl }} style={{ width: 38, height: 38, borderRadius: 19 }} contentFit="cover" />
                ) : (
                  <View className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: colors.primary }}><MaterialIcons name="person" size={21} color="#fff" /></View>
                )}
                <View className="flex-1">
                  <Text className="text-sm font-black text-foreground">{post.authorName}</Text>
                  <Text className="mt-1 text-xs text-muted">{formatDate(post.created_at)}</Text>
                </View>
              </View>
              {post.caption ? <Text className="mt-3 text-sm leading-5 text-foreground">{post.caption}</Text> : null}
              <View className="mt-4 flex-row items-center gap-5">
                <Pressable onPress={() => void toggleLike(post)} className="flex-row items-center gap-1"><MaterialIcons name={post.liked ? "favorite" : "favorite-border"} size={22} color={post.liked ? "#2F80ED" : colors.muted} /><Text className="text-xs font-bold text-muted">{post.likeCount}</Text></Pressable>
                <Pressable onPress={() => openComments(post.id)} className="flex-row items-center gap-1"><MaterialIcons name="chat-bubble-outline" size={21} color={colors.muted} /><Text className="text-xs font-bold text-muted">{post.commentCount}</Text></Pressable>
                <Pressable onPress={() => void sharePost(post)} className="flex-row items-center gap-1"><MaterialIcons name="share" size={21} color={colors.muted} /><Text className="text-xs font-bold text-muted">Compartir</Text></Pressable>
                {isAdmin ? <Pressable disabled={deletingPostId === post.id} onPress={() => void deletePost(post)} className="ml-auto" style={{ opacity: deletingPostId === post.id ? 0.45 : 1 }}><MaterialIcons name="delete-outline" size={22} color={colors.error} /></Pressable> : null}
              </View>
            </View>
          </View>
        )}
      />

      <Modal visible={Boolean(commentFor)} transparent animationType="slide" onRequestClose={() => setCommentFor(null)}><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1 justify-end bg-black/60"><View className="h-[58%] rounded-t-3xl p-5" style={{ backgroundColor: colors.surface }}><View className="mb-3 flex-row items-center justify-between"><Text className="text-lg font-black text-foreground">Comentarios</Text><Pressable onPress={() => setCommentFor(null)}><MaterialIcons name="close" size={24} color={colors.muted} /></Pressable></View><FlatList data={comments} keyExtractor={(item) => item.id} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }} renderItem={({ item }) => <View className="mb-3 flex-row gap-3" style={{ marginLeft: item.parent_comment_id ? 38 : 0 }}><View className="h-9 w-9 items-center justify-center overflow-hidden rounded-full" style={{ backgroundColor: `${colors.primary}22` }}>{item.avatar_url ? <ExpoImage source={{ uri: item.avatar_url }} style={{ width: 36, height: 36 }} contentFit="cover" /> : <Text style={{ color: colors.primary, fontWeight: "800" }}>{item.name[0]?.toUpperCase() || "U"}</Text>}</View><View className="flex-1 rounded-2xl px-3 py-2" style={{ backgroundColor: colors.background }}><Text className="text-xs font-black text-foreground">{item.name}</Text><Text className="mt-1 text-sm leading-5 text-foreground">{item.body}</Text><View className="mt-2 flex-row items-center gap-4"><Pressable onPress={() => { setReplyingTo(item); setComment(`@${item.name} `); }}><Text className="text-xs font-bold" style={{ color: colors.primary }}>Responder</Text></Pressable><Pressable onPress={() => void toggleCommentReaction(item)} className="flex-row items-center gap-1"><MaterialIcons name={item.reacted ? "favorite" : "favorite-border"} size={17} color={item.reacted ? "#E25563" : colors.muted} /><Text className="text-xs text-muted">{item.reactionCount}</Text></Pressable></View></View></View>} ListEmptyComponent={commentsLoading ? <ActivityIndicator color={colors.primary} /> : <Text className="py-8 text-center text-sm text-muted">Todavía no hay comentarios.</Text>} /><View className="flex-row items-center justify-between border-t pt-3" style={{ borderColor: colors.border }}>{replyingTo ? <Pressable onPress={() => { setReplyingTo(null); setComment(""); }}><Text className="mb-2 text-xs font-bold" style={{ color: colors.primary }}>Respondiendo a {replyingTo.name} · cancelar</Text></Pressable> : <View />}</View><View className="flex-row items-end gap-2"><TextInput value={comment} onChangeText={setComment} placeholder="Escribe un comentario" placeholderTextColor={colors.muted} multiline maxLength={2000} className="max-h-24 min-h-11 flex-1 rounded-2xl border px-4 py-3 text-foreground" style={{ borderColor: colors.border }} /><Pressable onPress={() => void submitComment()} className="h-11 w-11 items-center justify-center rounded-full" style={{ backgroundColor: colors.primary }}><MaterialIcons name="send" size={20} color="#fff" /></Pressable></View></View></KeyboardAvoidingView></Modal>

      <Modal visible={Boolean(fullMedia)} transparent animationType="fade" onRequestClose={() => setFullMedia(null)}><View style={{ flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center", paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }}>{fullMedia?.isVideo ? <View style={{ width: "100%", aspectRatio: fullMedia?.aspectRatio || 9 / 16, maxHeight: windowHeight - insets.top - insets.bottom - 24 }}><OfficialVideo uri={fullMedia.uri} aspectRatio={fullMedia?.aspectRatio || 9 / 16} fullscreen onOpenFullscreen={() => undefined} /></View> : fullMedia ? <ExpoImage source={{ uri: fullMedia.uri }} style={{ width: "100%", height: "100%" }} contentFit="contain" /> : null}<Pressable onPress={() => setFullMedia(null)} style={{ position: "absolute", top: insets.top + 12, right: 20, width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(0,0,0,0.65)", alignItems: "center", justifyContent: "center" }}><MaterialIcons name="close" size={24} color="#fff" /></Pressable></View></Modal>

      <Modal visible={adminVisible} transparent animationType="slide" onRequestClose={() => setAdminVisible(false)}><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1 justify-end bg-black/60"><View className="max-h-[90%] rounded-t-3xl p-6" style={{ backgroundColor: colors.surface }}><ScrollView keyboardShouldPersistTaps="handled"><View className="flex-row items-center justify-between"><Text className="text-xl font-black text-foreground">Panel administrador</Text><Pressable onPress={() => setAdminVisible(false)}><MaterialIcons name="close" size={24} color={colors.muted} /></Pressable></View><Text className="mt-2 text-sm leading-5 text-muted">Publica novedades y administra los cinco lugares destacados.</Text><Text className="mt-5 text-xs font-black uppercase tracking-widest text-muted">Nueva publicación</Text><TextInput value={postCaption} onChangeText={setPostCaption} placeholder="Descripción detallada de la publicación" placeholderTextColor={colors.muted} className="mt-3 min-h-24 rounded-2xl border px-4 py-3 text-foreground" style={{ borderColor: colors.border }} multiline textAlignVertical="top" maxLength={2000} /><Text className="mt-1 text-right text-xs text-muted">{postCaption.length}/2000</Text><Pressable disabled={posting} onPress={() => void pickAdminMedia()} className="mt-3 min-h-12 items-center justify-center rounded-xl" style={{ backgroundColor: colors.primary, opacity: posting ? 0.6 : 1 }}><Text className="font-black text-white">{posting ? "Subiendo…" : "Elegir foto o video sin recortar"}</Text></Pressable><Pressable onPress={startCreateVenue} className="mt-6 min-h-12 flex-row items-center justify-center gap-2 rounded-xl" style={{ backgroundColor: colors.primary }}><MaterialIcons name="add-business" size={20} color="#fff" /><Text className="font-black text-white">Agregar local al Top 5</Text></Pressable><Pressable onPress={() => setShowTopEditor((current) => !current)} className="mt-3 min-h-12 flex-row items-center justify-between rounded-xl px-4" style={{ backgroundColor: `${colors.primary}18` }}><Text className="text-xs font-black uppercase tracking-widest" style={{ color: colors.primary }}>Editar Top 5</Text><MaterialIcons name={showTopEditor ? "expand-less" : "expand-more"} size={21} color={colors.primary} /></Pressable>{showTopEditor ? featuredVenues.map((venue) => <Pressable key={venue.id} onPress={() => selectVenue(venue)} className="mt-2 flex-row items-center justify-between rounded-2xl border p-3" style={{ borderColor: colors.border }}><View className="flex-1"><Text className="font-bold text-foreground">#{venue.admin_rank} {venue.name}</Text><Text className="text-xs text-muted">{venue.address || "Sin dirección"}</Text></View><MaterialIcons name="edit" size={20} color={colors.primary} /></Pressable>) : null}{selectedVenue ? <View className="mt-5 rounded-2xl border p-4" style={{ borderColor: colors.primary }}><Text className="text-base font-black text-foreground">Editando #{adminRank}</Text><Pressable onPress={() => void pickVenuePhoto()} className="mt-3 overflow-hidden rounded-2xl" style={{ height: 150, backgroundColor: colors.background }}>{adminVenuePhotoUri || selectedVenue.admin_photo_url ? <Image source={{ uri: adminVenuePhotoUri || selectedVenue.admin_photo_url || undefined }} style={{ width: "100%", height: "100%" }} resizeMode="cover" /> : <View className="flex-1 items-center justify-center"><MaterialIcons name="add-a-photo" size={30} color={colors.primary} /><Text className="mt-2 text-sm text-muted">Subir foto sin recortar</Text></View>}</Pressable><View className="mt-2 flex-row gap-2"><Pressable onPress={() => void pickVenuePhoto()} className="flex-1 min-h-10 items-center justify-center rounded-xl border" style={{ borderColor: colors.border }}><Text className="text-xs font-bold text-foreground">Cambiar foto</Text></Pressable><Pressable disabled={!adminVenuePhotoUri} onPress={() => void rotateVenuePhoto()} className="flex-1 min-h-10 flex-row items-center justify-center gap-2 rounded-xl border" style={{ borderColor: colors.border, opacity: adminVenuePhotoUri ? 1 : 0.45 }}><MaterialIcons name="rotate-right" size={18} color={colors.primary} /><Text className="text-xs font-bold text-foreground">Girar {venuePhotoRotation}°</Text></Pressable></View><TextInput value={adminVenueName} onChangeText={setAdminVenueName} placeholder="Nombre del local" placeholderTextColor={colors.muted} className="mt-3 rounded-xl border px-4 py-3 text-foreground" style={{ borderColor: colors.border }} /><TextInput value={adminVenueAddress} onChangeText={setAdminVenueAddress} placeholder="Dirección" placeholderTextColor={colors.muted} className="mt-3 rounded-xl border px-4 py-3 text-foreground" style={{ borderColor: colors.border }} /><TextInput value={adminVenueDescription} onChangeText={setAdminVenueDescription} placeholder="Descripción del bar o discoteca" placeholderTextColor={colors.muted} className="mt-3 min-h-20 rounded-xl border px-4 py-3 text-foreground" style={{ borderColor: colors.border }} multiline textAlignVertical="top" /><TextInput value={adminRank} onChangeText={setAdminRank} keyboardType="number-pad" placeholder="Posición del 1 al 5" placeholderTextColor={colors.muted} className="mt-3 rounded-xl border px-4 py-3 text-foreground" style={{ borderColor: colors.border }} /><View className="mt-3 flex-row gap-2"><Pressable onPress={() => setSelectedVenue(null)} className="flex-1 min-h-12 items-center justify-center rounded-xl border" style={{ borderColor: colors.border }}><Text className="font-bold text-foreground">Cancelar</Text></Pressable><Pressable disabled={savingVenue} onPress={() => void saveVenue()} className="flex-1 min-h-12 items-center justify-center rounded-xl" style={{ backgroundColor: colors.primary, opacity: savingVenue ? 0.6 : 1 }}><Text className="font-bold text-white">{savingVenue ? "Guardando…" : "Guardar"}</Text></Pressable></View></View> : null}</ScrollView></View></KeyboardAvoidingView></Modal>
    </ScreenContainer>
  );
}
