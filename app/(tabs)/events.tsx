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

// NOTE: Full events screen restored in follow-up if truncated.
// Critical path: comments use get_official_post_comments_for_viewer.

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

type CommentRow = {
  id: string;
  body: string;
  created_at: string;
  user_id: string;
  name: string;
  avatar_url: string | null;
  parent_comment_id: string | null;
  reactionCount: number;
  reacted: boolean;
};

export default function EventsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user } = useAuth({ autoFetch: true });
  const [posts, setPosts] = useState<OfficialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentFor, setCommentFor] = useState<string | null>(null);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [comment, setComment] = useState("");
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const loadComments = useCallback(async (postId: string) => {
    setCommentsLoading(true);
    try {
      const rpc = await supabase.rpc("get_official_post_comments_for_viewer", { p_post_id: postId });
      let data: unknown = null;
      let error: { message: string } | null = null;
      if (!rpc.error && rpc.data) {
        data = Array.isArray(rpc.data) ? rpc.data : (rpc.data as { comments?: unknown }).comments ?? rpc.data;
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
  }, [user]);

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
      const rawPosts = (postRows ?? []) as Omit<
        OfficialPost,
        "likeCount" | "commentCount" | "liked" | "authorName" | "authorAvatarUrl"
      >[];
      const authorIds = [...new Set(rawPosts.map((post) => post.created_by))];
      let authorRows: OfficialAuthor[] = [];
      if (authorIds.length) {
        const authorResult = await supabase.rpc("get_official_post_authors", { p_post_ids: authorIds });
        if (!authorResult.error) authorRows = (authorResult.data ?? []) as OfficialAuthor[];
      }
      const authorMap = new Map(authorRows.map((row) => [row.id, row]));
      setPosts(
        rawPosts.map((post) => {
          const author = authorMap.get(post.created_by);
          return {
            ...post,
            likeCount: 0,
            commentCount: 0,
            liked: false,
            authorName: author?.name?.trim() || author?.username?.trim() || "Tragos Sociales Oficial",
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
    void loadComments(commentFor);
  };

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
        contentContainerStyle={{ gap: 12, paddingBottom: 24 }}
        ListEmptyComponent={<Text className="text-muted">Sin publicaciones oficiales todavía.</Text>}
        renderItem={({ item }) => (
          <View className="rounded-2xl border p-3" style={{ borderColor: colors.border, backgroundColor: colors.surface }}>
            <Text className="font-semibold text-foreground">{item.authorName}</Text>
            {item.caption ? <Text className="mt-1 text-sm text-muted">{item.caption}</Text> : null}
            {item.media_type === "image" ? (
              <ExpoImage source={{ uri: item.media_url }} style={{ width: "100%", height: 220, marginTop: 8, borderRadius: 12 }} contentFit="cover" />
            ) : (
              <Text className="mt-2 text-xs text-muted">Vídeo: abre el detalle en una próxima versión ampliada.</Text>
            )}
            <Pressable
              onPress={() => {
                setCommentFor(item.id);
                void loadComments(item.id);
              }}
              style={{ marginTop: 10 }}
            >
              <Text style={{ color: colors.primary, fontWeight: "700" }}>Comentarios</Text>
            </Pressable>
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
                <View style={{ marginBottom: 10 }}>
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
            <Pressable onPress={() => void sendComment()} style={{ backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 }}>
              <Text style={{ color: colors.background, fontWeight: "700" }}>Enviar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
