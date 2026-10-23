import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { useAppRefresh } from "@/lib/app-refresh";
import { supabase } from "@/lib/supabase";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Platform, Pressable, Text, View } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";

type ActivityReaction = "🍺" | "🔥" | "🍻" | "🚀" | "❤️";
const ACTIVITY_REACTIONS: ActivityReaction[] = ["🍺", "🔥", "🍻", "🚀", "❤️"];

type ActivityRow = {
  id: string;
  actor_id: string;
  type: "check_in" | "check_out" | "friend_request" | "reaction_checkin" | "reaction_story" | "direct_message";
  message: string;
  created_at: string;
  venue_id: number | null;
  reaction: ActivityReaction | null;
  reaction_emoji: string | null;
  read_at: string | null;
};

type ActivityItem = ActivityRow & { userName: string; avatar: string; venueName: string | null };

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

function formatActivityDate(value: string) {
  return new Date(value).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function ActivityScreen() {
  const colors = useColors();
  const { user } = useAuth({ autoFetch: true });
  const { revision, refreshNow } = useAppRefresh();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const hasLoadedActivitiesOnce = useRef(false);
  const [savingReactionId, setSavingReactionId] = useState<string | null>(null);

  const loadActivities = useCallback(async () => {
    if (!user) { setActivities([]); setIsLoading(false); return; }
    try {
      if (!hasLoadedActivitiesOnce.current) setIsLoading(true);
      const { data, error } = await supabase.from("activities").select("id, actor_id, type, message, created_at, venue_id, reaction, reaction_emoji, read_at").eq("recipient_id", user.id).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      const rows = (data ?? []) as ActivityRow[];
      const actorIds = [...new Set(rows.map((row) => row.actor_id))];
      const venueIds = [...new Set(rows.flatMap((row) => row.venue_id === null ? [] : [row.venue_id]))];
      const [{ data: profiles }, { data: venues }] = await Promise.all([
        actorIds.length ? supabase.rpc("get_visible_profiles", { p_ids: actorIds }) : Promise.resolve({ data: [] as { id: string; name: string | null }[] }),
        venueIds.length ? supabase.from("venues").select("id, name").in("id", venueIds) : Promise.resolve({ data: [] as { id: number; name: string }[] }),
      ]);
      const names = new Map(((profiles ?? []) as { id: string; name: string | null }[]).map((profile) => [profile.id, profile.name?.trim() || "Usuario"]));
      const venueNames = new Map(((venues ?? []) as { id: number; name: string }[]).map((venue) => [venue.id, venue.name]));
      setActivities(rows.map((row) => ({ ...row, userName: names.get(row.actor_id) || "Usuario", avatar: initials(names.get(row.actor_id) || "Usuario"), venueName: row.venue_id === null ? null : venueNames.get(row.venue_id) || null })));
    } catch (error) {
      console.warn("Activity unavailable:", error);
      setActivities([]);
    } finally {
      hasLoadedActivitiesOnce.current = true;
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadActivities();
    if (!user) return;
    const channel = supabase.channel(`activities-${user.id}`).on("postgres_changes", { event: "*", schema: "public", table: "activities", filter: `recipient_id=eq.${user.id}` }, () => void loadActivities()).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [loadActivities, revision, user]);

  const subtitle = useMemo(() => activities.length === 1 ? "1 novedad de tus amigos" : `${activities.length} novedades de tus amigos`, [activities.length]);

  const markActivityAsRead = useCallback(async (activityId: string) => {
    if (!user) return;
    const readAt = new Date().toISOString();
    setActivities((current) => current.map((activity) => activity.id === activityId ? { ...activity, read_at: readAt } : activity));
    const { error } = await supabase.from("activities").update({ read_at: readAt }).eq("id", activityId).eq("recipient_id", user.id);
    if (error) {
      setActivities((current) => current.map((activity) => activity.id === activityId ? { ...activity, read_at: null } : activity));
      console.warn("Could not mark activity as read:", error.message);
    }
  }, [user]);

  const deleteActivity = useCallback(async (activityId: string) => {
    if (!user) return;
    const previous = activities;
    setActivities((current) => current.filter((activity) => activity.id !== activityId));
    const { error } = await supabase.from("activities").delete().eq("id", activityId).eq("recipient_id", user.id);
    if (error) {
      setActivities(previous);
      Alert.alert("No se pudo borrar", "Ejecuta la migración de actividad y vuelve a intentarlo.");
      return;
    }
    refreshNow();
  }, [activities, refreshNow, user]);

  const clearActivities = useCallback(async () => {
    if (!user || activities.length === 0) return;
    const previous = activities;
    setActivities([]);
    const { error } = await supabase.from("activities").delete().eq("recipient_id", user.id);
    if (error) {
      setActivities(previous);
      Alert.alert("No se pudo limpiar", "Ejecuta la migración de actividad y vuelve a intentarlo.");
      return;
    }
    refreshNow();
  }, [activities, refreshNow, user]);

  const saveReaction = async (activityId: string, reaction: ActivityReaction) => {
    if (savingReactionId) return;
    const current = activities.find((activity) => activity.id === activityId)?.reaction ?? null;
    const nextReaction = current === reaction ? null : reaction;
    setSavingReactionId(activityId);
    setActivities((currentActivities) => currentActivities.map((activity) => activity.id === activityId ? { ...activity, reaction: nextReaction } : activity));
    if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { error } = await supabase.from("activities").update({ reaction: nextReaction }).eq("id", activityId).eq("recipient_id", user?.id ?? "");
    if (error) {
      setActivities((currentActivities) => currentActivities.map((activity) => activity.id === activityId ? { ...activity, reaction: current } : activity));
    }
    setSavingReactionId(null);
  };

  return (
    <ScreenContainer className="p-6">
      <View className="flex-1">
        <View className="mb-6 flex-row items-start justify-between gap-3">
          <View className="flex-1"><Text className="text-3xl font-bold text-foreground">Actividad</Text><Text className="text-sm text-muted">{activities.length ? subtitle : "Novedades reales de tus amigos"}</Text></View>
          {activities.length > 0 ? <Pressable onPress={() => void clearActivities()} accessibilityRole="button" accessibilityLabel="Limpiar toda la actividad" style={({ pressed }) => ({ minHeight: 38, borderRadius: 12, borderWidth: 1, borderColor: `${colors.error}66`, backgroundColor: `${colors.error}12`, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.65 : 1 })}><Text className="text-xs font-bold" style={{ color: colors.error }}>Limpiar</Text></Pressable> : null}
        </View>
        {isLoading ? <View className="flex-1 items-center justify-center"><ActivityIndicator color={colors.primary} /></View> : activities.length === 0 ? (
          <View className="flex-1 items-center justify-center"><IconSymbol name="bell.fill" size={38} color={colors.muted} /><Text className="mt-4 mb-2 text-lg font-semibold text-foreground">Sin actividad</Text><Text className="text-center text-sm text-muted">Aquí aparecerán los check-ins y check-outs reales de tus amigos.</Text></View>
        ) : (
          <FlatList data={activities} keyExtractor={(item) => item.id} contentContainerStyle={{ paddingBottom: 20 }} renderItem={({ item }) => (
            <Swipeable
              overshootLeft={false}
              renderLeftActions={() => <View className="mb-3 mr-2 w-20 items-center justify-center rounded-2xl" style={{ backgroundColor: `${colors.error}22` }}><IconSymbol name="trash.fill" size={22} color={colors.error} /></View>}
              onSwipeableOpen={() => void deleteActivity(item.id)}
            >
              <Pressable onPress={() => void markActivityAsRead(item.id)} accessibilityRole="button" accessibilityLabel={`${item.read_at ? "Actividad leída" : "Actividad no leída"}: ${item.message}`} className="mb-3 rounded-2xl border p-4" style={{ backgroundColor: item.read_at ? `${colors.success}0D` : `${colors.error}0D`, borderColor: item.read_at ? `${colors.success}88` : `${colors.error}AA` }}>
                <View className="flex-row gap-4">
                  <View className="h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: `${(item.read_at ? colors.success : colors.error)}22` }}><Text className="text-lg font-bold" style={{ color: item.read_at ? colors.success : colors.error }}>{item.avatar}</Text></View>
                  <View className="flex-1"><View className="flex-row items-center gap-2"><View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.read_at ? colors.success : colors.error }} /><Text className="font-semibold text-foreground">{item.userName}</Text></View><Text className="mt-1 text-sm leading-5 text-muted">{item.message}</Text><Text className="mt-1 text-xs text-muted">{formatActivityDate(item.created_at)}</Text></View>
                  <IconSymbol name={item.type === "check_out" ? "checkmark.circle.fill" : "cup.and.saucer.fill"} size={22} color={item.type === "check_out" ? colors.success : colors.primary} />
                </View>
              {item.type === "check_in" ? (
                <View className="mt-4 flex-row items-center justify-between rounded-xl border px-3 py-2" style={{ backgroundColor: `${colors.midnight}66`, borderColor: colors.border }}>
                  <Text className="text-xs font-semibold text-muted">Reacciona</Text>
                  <View className="flex-row items-center gap-1">
                    {ACTIVITY_REACTIONS.map((reaction) => (
                      <Pressable
                        key={reaction}
                        accessibilityRole="button"
                        accessibilityLabel={`${item.reaction === reaction ? "Quitar" : "Enviar"} reacción ${reaction}`}
                        onPress={() => void saveReaction(item.id, reaction)}
                        style={({ pressed }) => ({
                          minHeight: 34,
                          minWidth: 34,
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: 17,
                          backgroundColor: item.reaction === reaction ? `${colors.primary}55` : "transparent",
                          opacity: pressed || savingReactionId === item.id ? 0.55 : 1,
                        })}
                      >
                        <Text className="text-base">{reaction}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}
              </Pressable>
            </Swipeable>
          )} />
        )}
      </View>
    </ScreenContainer>
  );
}
