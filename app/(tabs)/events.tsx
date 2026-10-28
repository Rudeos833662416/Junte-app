import { ScreenContainer } from "@/components/screen-container";
import { OfficialVideo } from "@/components/official-video";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import {
  type OfficialAuthor,
  type OfficialPost,
  type CommentRow,
  formatDate,
} from "@/lib/events-shared";
import { supabase } from "@/lib/supabase";
import { Image as ExpoImage } from "expo-image";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
  type ViewToken,
} from "react-native";

export default function EventsScreen() {
  const colors = useColors();
  const { user } = useAuth({ autoFetch: true });
  const [posts, setPosts] = useState<OfficialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [commentFor, setCommentFor] = useState<string | null>(null);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [comment, setComment] = useState("");
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [fullVideo, setFullVideo] = useState<string | null>(null);
  const [visiblePostIds, setVisiblePostIds] = useState<Set<string>>(new Set());
  const deletedPostIdsRef = useRef(new Set<string>());
  const commentForRef = useRef<string | null>(null);

  useEffect(() => {
    commentForRef.current = commentFor;
  }, [commentFor]);

  const loadComments = useCallback(
    async (postId: string) => {
      setCommentsLoading(true);
      try {
        const rpc = await supabase.rpc("get_official_post_comments_for_viewer", {
          p_post_id: postId,
        });
        let data: unknown = null;
        let error: { message: string } | null = null;
        if (!rpc.error && rpc.data) {
          data = Array.isArray(rpc.data)
            ? rpc.data
            : (rpc.data as { comments?: unknown }).comments ?? rpc.data;
        } else {
          const direct = await supabase
            .from("official_post_comments")
            .select("id, body, created_at, user_id, parent_comment_id")
            .eq("post_id", postId)
            .order("created_at", { ascending: true });
          data = direct.data;
          error = direct.error;
        }
        if (error && /parent_comment_id|schema cache/i.test(error.message)) {
          const fallback = await supabase
            .from("official_post_comments")
            .select("id, body, created_at, user_id")
            .eq("post_id", postId)
            .order("created_at", { ascending: true });
          data = (fallback.data ?? []).map((row) => ({ ...row, parent_comment_id: null }));
          error = fallback.error;
        }
        if (error) throw error;
        const rows = (data ?? []) as {
          id: string;
          body: string;
          created_at: string;
          user_id: string;
          parent_comment_id: string | null;
        }[];
        const ids = [...new Set(rows.map((row) => row.user_id))];
        const { data: profiles } = ids.length
          ? await supabase.from("profiles").select("id, name, avatar_url").in("id", ids)
          : { data: [] as { id: string; name: string | null; avatar_url: string | null }[] };
        const { data: reactions } = rows.length
          ? await supabase
              .from("official_post_comment_reactions")
              .select("comment_id, user_id")
              .in(
                "comment_id",
                rows.map((row) => row.id),
              )
          : { data: [] as { comment_id: string; user_id: string }[] };
        const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
        const reactionMap = new Map<string, { count: number; reacted: boolean }>();
        (reactions ?? []).forEach((reaction) => {
          const current = reactionMap.get(reaction.comment_id) ?? { count: 0, reacted: false };
          current.count += 1;
          current.reacted = current.reacted || reaction.user_id === user?.id;
          reactionMap.set(reaction.comment_id, current);
        });
        setComments(
          rows.map((row) => ({
            ...row,
            name: profileMap.get(row.user_id)?.name?.trim() || "Usuario",
            avatar_url: profileMap.get(row.user_id)?.avatar_url ?? null,
            reactionCount: reactionMap.get(row.id)?.count ?? 0,
            reacted: reactionMap.get(row.id)?.reacted ?? false,
          })),
        );
      } catch (err) {
        console.error("No se pudieron cargar los comentarios:", err);
        setComments([]);
      } finally {
        setCommentsLoading(false);
      }
    },
    [user],
  );

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
        const authorResult = await supabase.rpc("get_official_post_authors", {
          p_post_ids: authorIds,
        });
        if (!authorResult.error) authorRows = (authorResult.data ?? []) as OfficialAuthor[];
      }
      const authorMap = new Map(authorRows.map((row) => [row.id, row]));

      const postIds = rawPosts.map((post) => post.id);
      let countsByPost = new Map<string, { likes: number; comments: number }>();
      if (postIds.length) {
        const countsResult = await supabase.rpc("get_official_post_counts", {
          p_post_ids: postIds,
        });
        if (!countsResult.error) {
          countsByPost = new Map(
            ((countsResult.data ?? []) as {
              post_id: string;
              like_count: number;
              comment_count: number;
            }[]).map((row) => [
              row.post_id,
              { likes: Number(row.like_count ?? 0), comments: Number(row.comment_count ?? 0) },
            ]),
          );
        } else {
          const [likesResult, commentsResult] = await Promise.all([
            supabase.from("official_post_likes").select("post_id").in("post_id", postIds),
            supabase.from("official_post_comments").select("post_id").in("post_id", postIds),
          ]);
          for (const row of (likesResult.data ?? []) as { post_id: string }[]) {
            const current = countsByPost.get(row.post_id) ?? { likes: 0, comments: 0 };
            current.likes += 1;
            countsByPost.set(row.post_id, current);
          }
          for (const row of (commentsResult.data ?? []) as { post_id: string }[]) {
            const current = countsByPost.get(row.post_id) ?? { likes: 0, comments: 0 };
            current.comments += 1;
            countsByPost.set(row.post_id, current);
          }
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
            authorName:
              author?.name?.trim() || author?.username?.trim() || "Tragos Sociales Oficial",
            authorAvatarUrl: author?.avatar_url ?? null,
          };
        }),
      );
      setIsAdmin(Boolean(adminRow?.is_admin));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

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
      ? await supabase
          .from("official_post_likes")
          .delete()
          .eq("post_id", post.id)
          .eq("user_id", user.id)
      : await supabase.from("official_post_likes").upsert({
          post_id: post.id,
          user_id: user.id,
        });
    if (result.error) void loadData();
  };

  const softDelete = async (postId: string) => {
    if (!user || !isAdmin) return;
    Alert.alert("Eliminar publicación", "¿Seguro que quieres eliminarla?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase.rpc("admin_soft_delete_official_post", {
            p_post_id: postId,
          });
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
    const { error } = await supabase.from("official_post_comments").insert({
      post_id: commentFor,
      user_id: user.id,
      body,
    });
    if (error) {
      setComment(body);
      Alert.alert("No se pudo comentar", error.message);
      return;
    }
    setPosts((current) =>
      current.map((post) =>
        post.id === commentFor ? { ...post, commentCount: post.commentCount + 1 } : post,
      ),
    );
    void loadComments(commentFor);
  };

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      setVisiblePostIds(new Set(viewableItems.map((item) => String(item.item?.id ?? ""))));
    },
  ).current;

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
      <Text className="mb-3 text-3xl font-bold text-foreground">Eventos</Text>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ gap: 14, paddingBottom: 28 }}
        viewabilityConfig={{ itemVisiblePercentThreshold: 55 }}
        onViewableItemsChanged={onViewableItemsChanged}
        ListEmptyComponent={
          <Text className="text-muted">Sin publicaciones oficiales todavía.</Text>
        }
        renderItem={({ item }) => (
          <View
            className="rounded-2xl border p-3"
            style={{ borderColor: colors.border, backgroundColor: colors.surface }}
          >
            <View className="mb-2 flex-row items-center justify-between">
              <Text className="font-semibold text-foreground">{item.authorName}</Text>
              <Text className="text-xs text-muted">{formatDate(item.created_at)}</Text>
            </View>
            {item.caption ? (
              <Text className="mb-2 text-sm text-muted">{item.caption}</Text>
            ) : null}
            {item.media_type === "image" ? (
              <ExpoImage
                source={{ uri: item.media_url }}
                style={{ width: "100%", height: 240, borderRadius: 12 }}
                contentFit="cover"
              />
            ) : (
              <OfficialVideo
                uri={item.media_url}
                aspectRatio={
                  item.media_width && item.media_height
                    ? item.media_width / item.media_height
                    : 9 / 16
                }
                isVisible={visiblePostIds.has(item.id)}
                onOpenFullscreen={() => setFullVideo(item.media_url)}
              />
            )}
            <View className="mt-3 flex-row items-center gap-4">
              <Pressable
                onPress={() => void toggleLike(item)}
                className="flex-row items-center gap-1"
              >
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
                  void loadComments(item.id);
                }}
                className="flex-row items-center gap-1"
              >
                <MaterialIcons name="chat-bubble-outline" size={20} color={colors.muted} />
                <Text style={{ color: colors.foreground }}>{item.commentCount}</Text>
              </Pressable>
              {isAdmin ? (
                <Pressable onPress={() => void softDelete(item.id)} className="ml-auto">
                  <MaterialIcons name="delete-outline" size={20} color="#ef4444" />
                </Pressable>
              ) : null}
            </View>
          </View>
        )}
      />

      <Modal visible={Boolean(commentFor)} animationType="slide" onRequestClose={() => setCommentFor(null)}>
        <View style={{ flex: 1, backgroundColor: colors.background, padding: 16, paddingTop: 48 }}>
          <Pressable onPress={() => setCommentFor(null)}>
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
              renderItem={({ item }) => (
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ color: colors.foreground, fontWeight: "700" }}>{item.name}</Text>
                  <Text style={{ color: colors.muted }}>{item.body}</Text>
                </View>
              )}
            />
          )}
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder="Escribe un comentario"
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
              <Text style={{ color: colors.background, fontWeight: "700" }}>Enviar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

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
