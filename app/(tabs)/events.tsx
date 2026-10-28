import { ScreenContainer } from "@/components/screen-container";
import { SecureMediaViewer } from "@/components/secure-media-viewer";
import { OfficialVideo } from "@/components/official-video";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import {
  type OfficialAuthor,
  type OfficialPost,
  type CommentRow,
  formatDate,
} from "@/lib/events-shared";
import { publishOfficialPost } from "@/lib/events-admin";
import { reportError } from "@/lib/report";
import { supabase } from "@/lib/supabase";
import { Image as ExpoImage } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  Share,
  Text,
  TextInput,
  View,
  type ViewToken,
} from "react-native";

const EDIT_WINDOW_MS = 10 * 60 * 1000;

function canEditComment(createdAt: string) {
  return Date.now() - new Date(createdAt).getTime() < EDIT_WINDOW_MS;
}

export default function EventsScreen() {
  const colors = useColors();
  const { user } = useAuth({ autoFetch: true });
  const [posts, setPosts] = useState<OfficialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [commentFor, setCommentFor] = useState<string | null>(null);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [comment, setComment] = useState("");
  const [replyTo, setReplyTo] = useState<CommentRow | null>(null);
  const [editingComment, setEditingComment] = useState<CommentRow | null>(null);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [fullVideo, setFullVideo] = useState<string | null>(null);
  const [fullImage, setFullImage] = useState<string | null>(null);
  const [visiblePostIds, setVisiblePostIds] = useState<Set<string>>(new Set());
  const [screenFocused, setScreenFocused] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [captionDraft, setCaptionDraft] = useState("");
  const deletedPostIdsRef = useRef(new Set<string>());

  useFocusEffect(
    useCallback(() => {
      setScreenFocused(true);
      return () => {
        setScreenFocused(false);
        setFullVideo(null);
        setFullImage(null);
      };
    }, []),
  );

  const loadComments = useCallback(async (postId: string) => {
    setCommentsLoading(true);
    try {
      const rpc = await supabase.rpc("get_official_post_comments_for_viewer", { p_post_id: postId });
      let data: unknown = null;
      let error: { message: string } | null = null;
      if (!rpc.error && rpc.data) {
        data = Array.isArray(rpc.data)
          ? rpc.data
          : (rpc.data as { comments?: unknown }).comments ?? rpc.data;
      } else {
        const direct = await supabase
          .from("official_post_comments")
          .select("id, body, created_at, user_id, parent_comment_id, edited_at")
          .eq("post_id", postId)
          .order("created_at", { ascending: true });
        data = direct.data;
        error = direct.error;
      }
      if (error) throw error;
      const rows = (data ?? []) as {
        id: string;
        body: string;
        created_at: string;
        user_id: string;
        parent_comment_id: string | null;
        edited_at?: string | null;
      }[];
      const ids = [...new Set(rows.map((row) => row.user_id))];
      const { data: profiles } = ids.length
        ? await supabase.from("profiles").select("id, name, avatar_url").in("id", ids)
        : { data: [] as { id: string; name: string | null; avatar_url: string | null }[] };
      const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
      setComments(
        rows.map((row) => ({
          ...row,
          name: profileMap.get(row.user_id)?.name?.trim() || "Usuario",
          avatar_url: profileMap.get(row.user_id)?.avatar_url ?? null,
          reactionCount: 0,
          reacted: false,
        })),
      );
    } catch (err) {
      reportError(err, { screen: "events", action: "loadComments" });
      setComments([]);
    } finally {
      setCommentsLoading(false);
    }
  }, []);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [{ data: postRows }, { data: adminRow }] = await Promise.all([
        supabase
          .from("official_posts")
          .select("id, media_url, media_type, caption, created_at, created_by, media_width, media_height")
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle(),
      ]);
      const rawPosts = ((postRows ?? []) as Omit<
        OfficialPost,
        "likeCount" | "commentCount" | "liked" | "authorName" | "authorAvatarUrl"
      >[]).filter((post) => !deletedPostIdsRef.current.has(post.id));

      const authorIds = [...new Set(rawPosts.map((post) => post.created_by))];
      let authorRows: OfficialAuthor[] = [];
      if (authorIds.length) {
        const authorResult = await supabase.rpc("get_official_post_authors", { p_post_ids: authorIds });
        if (!authorResult.error) authorRows = (authorResult.data ?? []) as OfficialAuthor[];
      }
      const authorMap = new Map(authorRows.map((row) => [row.id, row]));

      const postIds = rawPosts.map((post) => post.id);
      let countsByPost = new Map<string, { likes: number; comments: number }>();
      if (postIds.length) {
        const countsResult = await supabase.rpc("get_official_post_counts", { p_post_ids: postIds });
        if (!countsResult.error) {
          countsByPost = new Map(
            ((countsResult.data ?? []) as { post_id: string; like_count: number; comment_count: number }[]).map(
              (row) => [row.post_id, { likes: Number(row.like_count ?? 0), comments: Number(row.comment_count ?? 0) }],
            ),
          );
        }
      }

      let likedSet = new Set<string>();
      if (postIds.length) {
        const { data: ownLikes } = await supabase
          .from("official_post_likes")
          .select("post_id")
          .in("post_id", postIds)
          .eq("user_id", user.id);
        likedSet = new Set(((ownLikes ?? []) as { post_id: string }[]).map((row) => row.post_id));
      }

      setPosts(
        rawPosts.map((post) => {
          const author = authorMap.get(post.created_by);
          const counts = countsByPost.get(post.id);
          return {
            ...post,
            likeCount: counts?.likes ?? 0,
            commentCount: counts?.comments ?? 0,
            liked: likedSet.has(post.id),
            authorName: author?.name?.trim() || author?.username?.trim() || "Tragos Sociales Oficial",
            authorAvatarUrl: author?.avatar_url ?? null,
          };
        }),
      );
      setIsAdmin(Boolean(adminRow?.is_admin));
    } catch (err) {
      reportError(err, { screen: "events", action: "loadData" });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`events-live-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "official_posts" }, () => {
        void loadData();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "official_post_likes" }, () => {
        void loadData();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "official_post_comments" }, (payload) => {
        const row = (payload.new ?? payload.old) as { post_id?: string };
        if (row.post_id && commentFor === row.post_id) void loadComments(row.post_id);
        void loadData();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, loadData, loadComments, commentFor]);

  const toggleLike = async (post: OfficialPost) => {
    if (!user) return;
    setPosts((current) =>
      current.map((item) =>
        item.id === post.id
          ? {
              ...item,
              liked: !item.liked,
              likeCount: Math.max(0, item.likeCount + (item.liked ? -1 : 1)),
            }
          : item,
      ),
    );
    const result = post.liked
      ? await supabase.from("official_post_likes").delete().eq("post_id", post.id).eq("user_id", user.id)
      : await supabase.from("official_post_likes").upsert({ post_id: post.id, user_id: user.id });
    if (result.error) void loadData();
  };

  const sharePost = async (post: OfficialPost) => {
    try {
      await Share.share({
        message: `${post.authorName}${post.caption ? `: ${post.caption}` : ""}\n${post.media_url}`,
        url: post.media_url,
      });
    } catch (err) {
      reportError(err, { action: "sharePost" });
    }
  };

  const softDelete = async (postId: string) => {
    if (!user || !isAdmin) return;
    Alert.alert("Eliminar publicación", "¿Seguro que quieres eliminarla?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase.rpc("admin_soft_delete_official_post", { p_post_id: postId });
          if (error) {
            Alert.alert("No se pudo eliminar", error.message);
            return;
          }
          deletedPostIdsRef.current.add(postId);
          setPosts((current) => current.filter((post) => post.id !== postId));
        },
      },
    ]);
  };

  const sendComment = async () => {
    if (!user || !commentFor || !comment.trim()) return;
    const body = comment.trim();
    setComment("");
    if (editingComment) {
      if (!canEditComment(editingComment.created_at) && !isAdmin) {
        Alert.alert("Tiempo agotado", "Solo puedes editar durante 10 minutos.");
        setEditingComment(null);
        return;
      }
      const { error } = await supabase
        .from("official_post_comments")
        .update({ body, edited_at: new Date().toISOString() })
        .eq("id", editingComment.id);
      if (error) {
        setComment(body);
        Alert.alert("No se pudo editar", error.message);
        return;
      }
      setEditingComment(null);
      void loadComments(commentFor);
      return;
    }
    const payload: { post_id: string; user_id: string; body: string; parent_comment_id?: string } = {
      post_id: commentFor,
      user_id: user.id,
      body,
    };
    if (replyTo) payload.parent_comment_id = replyTo.id;
    const { error } = await supabase.from("official_post_comments").insert(payload);
    if (error) {
      setComment(body);
      Alert.alert("No se pudo comentar", error.message);
      return;
    }
    setReplyTo(null);
    setPosts((current) =>
      current.map((post) => (post.id === commentFor ? { ...post, commentCount: post.commentCount + 1 } : post)),
    );
    void loadComments(commentFor);
  };

  const deleteComment = (item: CommentRow) => {
    if (!user || !commentFor) return;
    const isOwner = item.user_id === user.id;
    if (!isOwner && !isAdmin) return;
    Alert.alert("Borrar comentario", "¿Eliminar este comentario?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Borrar",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase.from("official_post_comments").delete().eq("id", item.id);
          if (error) {
            Alert.alert("Error", error.message);
            return;
          }
          void loadComments(commentFor);
          void loadData();
        },
      },
    ]);
  };

  const publishMedia = async () => {
    if (!user || !isAdmin) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setPublishing(true);
    try {
      const isVideo = (asset.type ?? "").includes("video") || Boolean(asset.duration);
      await publishOfficialPost({
        userId: user.id,
        uri: asset.uri,
        mediaType: isVideo ? "video" : "image",
        caption: captionDraft,
        width: asset.width,
        height: asset.height,
      });
      setCaptionDraft("");
      void loadData();
      Alert.alert("Publicado", "La publicación oficial ya está en el feed.");
    } catch (err) {
      reportError(err, { action: "publishOfficialPost" });
      Alert.alert("Error", err instanceof Error ? err.message : "No se pudo publicar");
    } finally {
      setPublishing(false);
    }
  };

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    setVisiblePostIds(new Set(viewableItems.map((item) => String(item.item?.id ?? ""))));
  }).current;

  if (loading) {
    return (
      <ScreenContainer className="p-6">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="p-4">
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="text-3xl font-bold text-foreground">Eventos</Text>
        {isAdmin ? (
          <View className="flex-row gap-2">
            <Pressable
              onPress={() => router.push("/admin/venues")}
              style={{
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.border,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "700" }}>Locales</Text>
            </Pressable>
            <Pressable
              onPress={() => void publishMedia()}
              disabled={publishing}
              style={{
                borderRadius: 999,
                backgroundColor: colors.primary,
                paddingHorizontal: 10,
                paddingVertical: 6,
                opacity: publishing ? 0.6 : 1,
              }}
            >
              <Text style={{ color: colors.background, fontSize: 12, fontWeight: "700" }}>
                {publishing ? "…" : "Publicar"}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {isAdmin ? (
        <TextInput
          value={captionDraft}
          onChangeText={setCaptionDraft}
          placeholder="Pie de foto opcional antes de Publicar"
          placeholderTextColor={colors.muted}
          style={{
            marginBottom: 10,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 10,
            color: colors.foreground,
          }}
        />
      ) : null}

      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ gap: 14, paddingBottom: 28 }}
        viewabilityConfig={{ itemVisiblePercentThreshold: 55 }}
        onViewableItemsChanged={onViewableItemsChanged}
        ListEmptyComponent={<Text className="text-muted">Sin publicaciones oficiales todavía.</Text>}
        renderItem={({ item }) => {
          const ratio =
            item.media_width && item.media_height && item.media_height > 0
              ? item.media_width / item.media_height
              : item.media_type === "video"
                ? 9 / 16
                : 4 / 5;
          return (
            <View
              className="rounded-2xl border p-3"
              style={{ borderColor: colors.border, backgroundColor: colors.surface }}
            >
              <View className="mb-2 flex-row items-center gap-2">
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    overflow: "hidden",
                    backgroundColor: `${colors.primary}22`,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {item.authorAvatarUrl ? (
                    <ExpoImage source={{ uri: item.authorAvatarUrl }} style={{ width: 40, height: 40 }} contentFit="cover" />
                  ) : (
                    <Text style={{ color: colors.primary, fontWeight: "700" }}>
                      {(item.authorName[0] ?? "T").toUpperCase()}
                    </Text>
                  )}
                </View>
                <View className="flex-1">
                  <Text className="font-semibold text-foreground">{item.authorName}</Text>
                  <Text className="text-xs text-muted">{formatDate(item.created_at)}</Text>
                </View>
              </View>

              {item.caption ? <Text className="mb-2 text-sm text-muted">{item.caption}</Text> : null}

              {item.media_type === "image" ? (
                <Pressable onPress={() => setFullImage(item.media_url)}>
                  <ExpoImage
                    source={{ uri: item.media_url }}
                    style={{ width: "100%", aspectRatio: ratio, borderRadius: 12 }}
                    contentFit="contain"
                  />
                </Pressable>
              ) : (
                <OfficialVideo
                  uri={item.media_url}
                  aspectRatio={ratio}
                  isVisible={screenFocused && visiblePostIds.has(item.id) && !fullVideo}
                  onOpenFullscreen={() => setFullVideo(item.media_url)}
                />
              )}

              <View className="mt-3 flex-row items-center gap-4">
                <Pressable onPress={() => void toggleLike(item)} className="flex-row items-center gap-1" hitSlop={8}>
                  <MaterialIcons
                    name={item.liked ? "favorite" : "favorite-border"}
                    size={20}
                    color={item.liked ? "#ef4444" : colors.muted}
                  />
                  <Text style={{ color: colors.foreground }}>{item.likeCount}</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setCommentFor(item.id);
                    setReplyTo(null);
                    setEditingComment(null);
                    void loadComments(item.id);
                  }}
                  className="flex-row items-center gap-1"
                  hitSlop={8}
                >
                  <MaterialIcons name="chat-bubble-outline" size={20} color={colors.muted} />
                  <Text style={{ color: colors.foreground }}>{item.commentCount}</Text>
                </Pressable>
                <Pressable onPress={() => void sharePost(item)} hitSlop={8}>
                  <MaterialIcons name="share" size={20} color={colors.muted} />
                </Pressable>
                {isAdmin ? (
                  <Pressable onPress={() => void softDelete(item.id)} className="ml-auto" hitSlop={8}>
                    <MaterialIcons name="delete-outline" size={20} color="#ef4444" />
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        }}
      />

      <Modal
        visible={Boolean(commentFor)}
        animationType="slide"
        onRequestClose={() => {
          setCommentFor(null);
          setEditingComment(null);
          setReplyTo(null);
        }}
      >
        <View style={{ flex: 1, backgroundColor: colors.background, padding: 16, paddingTop: 48 }}>
          <Pressable
            onPress={() => {
              setCommentFor(null);
              setEditingComment(null);
              setReplyTo(null);
            }}
          >
            <Text style={{ color: colors.primary, fontWeight: "700" }}>Cerrar</Text>
          </Pressable>
          {commentsLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
          ) : (
            <FlatList
              data={comments}
              keyExtractor={(item) => item.id}
              style={{ marginTop: 12, flex: 1 }}
              ListEmptyComponent={<Text className="text-muted">Sé el primero en comentar</Text>}
              renderItem={({ item }) => {
                const isOwner = item.user_id === user?.id;
                const showEdit = isOwner && canEditComment(item.created_at);
                const showDelete = isOwner || isAdmin;
                return (
                  <View
                    style={{
                      marginBottom: 14,
                      marginLeft: item.parent_comment_id ? 18 : 0,
                      flexDirection: "row",
                      gap: 10,
                    }}
                  >
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        overflow: "hidden",
                        backgroundColor: `${colors.primary}22`,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {item.avatar_url ? (
                        <ExpoImage source={{ uri: item.avatar_url }} style={{ width: 36, height: 36 }} contentFit="cover" />
                      ) : (
                        <Text style={{ color: colors.primary, fontWeight: "700" }}>
                          {(item.name[0] ?? "U").toUpperCase()}
                        </Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.foreground, fontWeight: "700" }}>{item.name}</Text>
                      <Text style={{ color: colors.muted }}>{item.body}</Text>
                      <View style={{ flexDirection: "row", gap: 12, marginTop: 4 }}>
                        <Pressable onPress={() => setReplyTo(item)}>
                          <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "600" }}>Responder</Text>
                        </Pressable>
                        {showEdit ? (
                          <Pressable
                            onPress={() => {
                              setEditingComment(item);
                              setComment(item.body);
                              setReplyTo(null);
                            }}
                          >
                            <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "600" }}>Editar</Text>
                          </Pressable>
                        ) : null}
                        {showDelete ? (
                          <Pressable onPress={() => deleteComment(item)}>
                            <Text style={{ color: "#ef4444", fontSize: 12, fontWeight: "600" }}>Borrar</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                  </View>
                );
              }}
            />
          )}
          {replyTo ? (
            <Text className="mb-1 text-xs text-muted">
              Respondiendo a {replyTo.name}{" "}
              <Text style={{ color: colors.primary }} onPress={() => setReplyTo(null)}>
                (cancelar)
              </Text>
            </Text>
          ) : null}
          {editingComment ? (
            <Text className="mb-1 text-xs text-muted">
              Editando comentario{" "}
              <Text
                style={{ color: colors.primary }}
                onPress={() => {
                  setEditingComment(null);
                  setComment("");
                }}
              >
                (cancelar)
              </Text>
            </Text>
          ) : null}
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder={
                editingComment
                  ? "Edita tu comentario"
                  : replyTo
                    ? "Escribe una respuesta"
                    : "Escribe un comentario"
              }
              placeholderTextColor={colors.muted}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 10,
                color: colors.foreground,
              }}
            />
            <Pressable
              onPress={() => void sendComment()}
              style={{
                backgroundColor: colors.primary,
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 10,
              }}
            >
              <Text style={{ color: colors.background, fontWeight: "700" }}>
                {editingComment ? "Guardar" : "Enviar"}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <SecureMediaViewer uri={fullImage} onClose={() => setFullImage(null)} secure />

      <Modal visible={Boolean(fullVideo)} animationType="fade" onRequestClose={() => setFullVideo(null)}>
        <View style={{ flex: 1, backgroundColor: "#000", justifyContent: "center" }}>
          <Pressable
            onPress={() => setFullVideo(null)}
            style={{ position: "absolute", top: 48, right: 20, zIndex: 2 }}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>Cerrar</Text>
          </Pressable>
          {fullVideo ? (
            <OfficialVideo
              uri={fullVideo}
              aspectRatio={9 / 16}
              fullscreen
              isVisible
              onOpenFullscreen={() => undefined}
            />
          ) : null}
        </View>
      </Modal>
    </ScreenContainer>
  );
}
