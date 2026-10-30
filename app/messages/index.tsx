import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { supabase } from "@/lib/supabase";

type MessageRow = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

type Conversation = {
  otherId: string;
  name: string;
  lastBody: string;
  lastAt: string;
  unread: number;
};

export default function MessagesInboxScreen() {
  const colors = useColors();
  const { user } = useAuth({ autoFetch: true });
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Conversation[]>([]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("direct_messages")
        .select("id, sender_id, recipient_id, body, created_at, read_at")
        .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;

      const rows = (data ?? []) as MessageRow[];
      const byOther = new Map<string, Conversation>();
      const unreadByOther = new Map<string, number>();

      for (const row of rows) {
        const otherId = row.sender_id === user.id ? row.recipient_id : row.sender_id;
        if (!byOther.has(otherId)) {
          byOther.set(otherId, {
            otherId,
            name: "Chat",
            lastBody: row.body,
            lastAt: row.created_at,
            unread: 0,
          });
        }
        if (row.recipient_id === user.id && !row.read_at) {
          unreadByOther.set(otherId, (unreadByOther.get(otherId) ?? 0) + 1);
        }
      }

      const otherIds = [...byOther.keys()];
      if (otherIds.length) {
        const { data: profiles } = await supabase
          .from("public_profiles")
          .select("id, name")
          .in("id", otherIds);
        for (const profile of profiles ?? []) {
          const current = byOther.get(profile.id);
          if (current) current.name = profile.name?.trim() || "Chat";
        }
      }

      const list = [...byOther.values()]
        .map((item) => ({ ...item, unread: unreadByOther.get(item.otherId) ?? 0 }))
        .sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
      setItems(list);
    } catch (err) {
      console.warn("Inbox load failed:", err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void load();
      return undefined;
    }, [load]),
  );

  const empty = useMemo(
    () => (
      <View className="flex-1 items-center justify-center py-20">
        <Text className="text-base font-semibold text-foreground">Sin mensajes todavía</Text>
        <Text className="mt-2 text-center text-sm text-muted">
          Escribe a un amigo desde su perfil para empezar una conversación.
        </Text>
      </View>
    ),
    [],
  );

  return (
    <ScreenContainer className="p-5">
      <View className="mb-4 flex-row items-center gap-3">
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Volver">
          <Text className="text-2xl" style={{ color: colors.primary }}>
            ‹
          </Text>
        </Pressable>
        <Text className="text-2xl font-bold text-foreground">Mensajes</Text>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.otherId}
          ListEmptyComponent={empty}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/chat/${item.otherId}`)}
              style={({ pressed }) => ({
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                paddingHorizontal: 14,
                paddingVertical: 12,
                marginBottom: 10,
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <View className="flex-row items-center justify-between">
                <Text className="text-base font-bold text-foreground">{item.name}</Text>
                <Text className="text-xs text-muted">
                  {new Date(item.lastAt).toLocaleString([], {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              </View>
              <View className="mt-1 flex-row items-center justify-between gap-2">
                <Text className="flex-1 text-sm text-muted" numberOfLines={1}>
                  {item.lastBody}
                </Text>
                {item.unread > 0 ? (
                  <View
                    style={{
                      minWidth: 22,
                      height: 22,
                      borderRadius: 11,
                      backgroundColor: colors.primary,
                      alignItems: "center",
            <Pressable
              onPress={() => router.push(`/messages/${item.otherId}`)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 14,
                paddingVertical: 12,
                paddingHorizontal: 4,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 26,
                  overflow: "hidden",
                  backgroundColor: `${colors.primary}18`,
                  borderWidth: 1.5,
                  borderColor: item.unread > 0 ? colors.primary : colors.border,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {item.avatarUrl ? (
                  <ExpoImage
                    source={{ uri: item.avatarUrl }}
                    style={{ width: 52, height: 52 }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                ) : (
                  <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 18 }}>
                    {(item.name || "?").slice(0, 1).toUpperCase()}
                  </Text>
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <Text
                    style={{
                      color: colors.foreground,
                      fontWeight: item.unread > 0 ? "700" : "600",
                      fontSize: 16,
                      flex: 1,
                    }}
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
                  {item.unread > 0 ? (
                    <View
                      style={{
                        backgroundColor: colors.primary,
                        borderRadius: 10,
                        minWidth: 22,
                        height: 22,
                        alignItems: "center",
                        justifyContent: "center",
                        paddingHorizontal: 6,
                      }}
                    >
                      <Text style={{ color: colors.background, fontSize: 11, fontWeight: "800" }}>
                        {item.unread > 99 ? "99+" : item.unread}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </Pressable>
          )}
        />
      )}
    </ScreenContainer>
  );
}
            <Pressable
              onPress={() => router.push(`/messages/${item.otherId}`)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 14,
                paddingVertical: 12,
                paddingHorizontal: 4,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 26,
                  overflow: "hidden",
                  backgroundColor: `${colors.primary}18`,
                  borderWidth: 1.5,
                  borderColor: item.unread > 0 ? colors.primary : colors.border,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {item.avatarUrl ? (
                  <ExpoImage
                    source={{ uri: item.avatarUrl }}
                    style={{ width: 52, height: 52 }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                ) : (
                  <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 18 }}>
                    {(item.name || "?").slice(0, 1).toUpperCase()}
                  </Text>
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <Text
                    style={{
                      color: colors.foreground,
                      fontWeight: item.unread > 0 ? "700" : "600",
                      fontSize: 16,
                      flex: 1,
                    }}
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
                  {item.unread > 0 ? (
                    <View
                      style={{
                        backgroundColor: colors.primary,
                        borderRadius: 10,
                        minWidth: 22,
                        height: 22,
                        alignItems: "center",
                        justifyContent: "center",
                        paddingHorizontal: 6,
                      }}
                    >
                      <Text style={{ color: colors.background, fontSize: 11, fontWeight: "800" }}>
                        {item.unread > 99 ? "99+" : item.unread}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </Pressable>
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { supabase } from "@/lib/supabase";

type MessageRow = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

type Conversation = {
  otherId: string;
  name: string;
  lastBody: string;
  lastAt: string;
  unread: number;
};

export default function MessagesInboxScreen() {
  const colors = useColors();
  const { user } = useAuth({ autoFetch: true });
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Conversation[]>([]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("direct_messages")
        .select("id, sender_id, recipient_id, body, created_at, read_at")
        .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;

      const rows = (data ?? []) as MessageRow[];
      const byOther = new Map<string, Conversation>();
      const unreadByOther = new Map<string, number>();

      for (const row of rows) {
        const otherId = row.sender_id === user.id ? row.recipient_id : row.sender_id;
        if (!byOther.has(otherId)) {
          byOther.set(otherId, {
            otherId,
            name: "Chat",
            lastBody: row.body,
            lastAt: row.created_at,
            unread: 0,
          });
        }
        if (row.recipient_id === user.id && !row.read_at) {
          unreadByOther.set(otherId, (unreadByOther.get(otherId) ?? 0) + 1);
        }
      }

      const otherIds = [...byOther.keys()];
      if (otherIds.length) {
        const { data: profiles } = await supabase
          .from("public_profiles")
          .select("id, name")
          .in("id", otherIds);
        for (const profile of profiles ?? []) {
          const current = byOther.get(profile.id);
          if (current) current.name = profile.name?.trim() || "Chat";
        }
      }

      const list = [...byOther.values()]
        .map((item) => ({ ...item, unread: unreadByOther.get(item.otherId) ?? 0 }))
        .sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
      setItems(list);
    } catch (err) {
      console.warn("Inbox load failed:", err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void load();
      return undefined;
    }, [load]),
  );

  const empty = useMemo(
    () => (
      <View className="flex-1 items-center justify-center py-20">
        <Text className="text-base font-semibold text-foreground">Sin mensajes todavía</Text>
        <Text className="mt-2 text-center text-sm text-muted">
          Escribe a un amigo desde su perfil para empezar una conversación.
        </Text>
      </View>
    ),
    [],
  );

  return (
    <ScreenContainer className="p-5">
      <View className="mb-4 flex-row items-center gap-3">
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Volver">
          <Text className="text-2xl" style={{ color: colors.primary }}>
            ‹
          </Text>
        </Pressable>
        <Text className="text-2xl font-bold text-foreground">Mensajes</Text>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.otherId}
          ListEmptyComponent={empty}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/chat/${item.otherId}`)}
              style={({ pressed }) => ({
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                paddingHorizontal: 14,
                paddingVertical: 12,
                marginBottom: 10,
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <View className="flex-row items-center justify-between">
                <Text className="text-base font-bold text-foreground">{item.name}</Text>
                <Text className="text-xs text-muted">
                  {new Date(item.lastAt).toLocaleString([], {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              </View>
              <View className="mt-1 flex-row items-center justify-between gap-2">
                <Text className="flex-1 text-sm text-muted" numberOfLines={1}>
                  {item.lastBody}
                </Text>
                {item.unread > 0 ? (
                  <View
                    style={{
                      minWidth: 22,
                      height: 22,
                      borderRadius: 11,
                      backgroundColor: colors.primary,
                      alignItems: "center",
                      justifyContent: "center",
                      paddingHorizontal: 6,
                    }}
                  >
                    <Text style={{ color: colors.background, fontSize: 11, fontWeight: "700" }}>
                      {item.unread > 99 ? "99+" : item.unread}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          )}
        />
      )}
    </ScreenContainer>
  );
}
