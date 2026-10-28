import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { supabase } from "@/lib/supabase";
import { updateVenueAdmin, uploadVenuePhoto } from "@/lib/events-admin";
import { reportError } from "@/lib/report";
import { rankColors, type Venue } from "@/lib/events-shared";

export default function AdminVenuesScreen() {
  const colors = useColors();
  const { user } = useAuth({ autoFetch: true });
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [rank, setRank] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .maybeSingle();
      const admin = Boolean(profile?.is_admin);
      setIsAdmin(admin);
      if (!admin) {
        setVenues([]);
        return;
      }
      const { data, error } = await supabase
        .from("venues")
        .select(
          "id, name, address, description, city, latitude, longitude, admin_rank, admin_photo_url",
        )
        .order("admin_rank", { ascending: true, nullsFirst: false })
        .limit(100);
      if (error) throw error;
      setVenues((data ?? []) as Venue[]);
    } catch (err) {
      reportError(err, { screen: "admin/venues" });
      Alert.alert("Error", err instanceof Error ? err.message : "No se pudo cargar");
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

  const startEdit = (venue: Venue) => {
    setEditingId(venue.id);
    setRank(venue.admin_rank != null ? String(venue.admin_rank) : "");
    setDescription(venue.description ?? "");
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      const parsed = rank.trim() === "" ? null : Number(rank);
      if (parsed != null && (!Number.isFinite(parsed) || parsed < 1 || parsed > 99)) {
        throw new Error("El ranking debe ser un número entre 1 y 99");
      }
      await updateVenueAdmin({
        venueId: editingId,
        admin_rank: parsed,
        description: description.trim() || null,
      });
      setEditingId(null);
      void load();
    } catch (err) {
      reportError(err, { action: "updateVenueAdmin" });
      Alert.alert("No se pudo guardar", err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  const pickPhoto = async (venueId: number) => {
    if (!user) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    setSaving(true);
    try {
      await uploadVenuePhoto(venueId, result.assets[0].uri);
      void load();
    } catch (err) {
      reportError(err, { action: "venuePhoto" });
      Alert.alert("Foto", err instanceof Error ? err.message : "No se pudo subir");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <ScreenContainer className="p-6">
        <ActivityIndicator color={colors.primary} />
      </ScreenContainer>
    );
  }

  if (!isAdmin) {
    return (
      <ScreenContainer className="p-6">
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: colors.primary, fontWeight: "700" }}>‹ Volver</Text>
        </Pressable>
        <Text className="mt-6 text-lg font-semibold text-foreground">Solo administradores</Text>
        <Text className="mt-2 text-sm text-muted">
          Esta pantalla gestiona ranking y fotos de locales.
        </Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="p-4">
      <View className="mb-4 flex-row items-center gap-3">
        <Pressable onPress={() => router.back()}>
          <Text className="text-2xl" style={{ color: colors.primary }}>
            ‹
          </Text>
        </Pressable>
        <Text className="text-2xl font-bold text-foreground">Admin · Locales</Text>
      </View>

      <FlatList
        data={venues}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, gap: 10 }}
        ListEmptyComponent={<Text className="text-muted">No hay venues todavía.</Text>}
        renderItem={({ item }) => {
          const rankColor =
            item.admin_rank != null && item.admin_rank <= rankColors.length
              ? rankColors[item.admin_rank - 1]
              : colors.muted;
          const editing = editingId === item.id;
          return (
            <View
              className="rounded-2xl border p-3"
              style={{ borderColor: colors.border, backgroundColor: colors.surface }}
            >
              <View className="flex-row items-center justify-between">
                <Text className="flex-1 font-semibold text-foreground">{item.name}</Text>
                {item.admin_rank != null ? (
                  <Text style={{ color: rankColor, fontWeight: "800" }}>#{item.admin_rank}</Text>
                ) : (
                  <Text className="text-xs text-muted">Sin rank</Text>
                )}
              </View>
              {item.city ? <Text className="mt-1 text-xs text-muted">{item.city}</Text> : null}
              {item.description ? (
                <Text className="mt-1 text-sm text-muted" numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}

              {editing ? (
                <View className="mt-3 gap-2">
                  <TextInput
                    value={rank}
                    onChangeText={setRank}
                    placeholder="Ranking (1-99)"
                    keyboardType="number-pad"
                    placeholderTextColor={colors.muted}
                    style={{
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 10,
                      padding: 10,
                      color: colors.foreground,
                    }}
                  />
                  <TextInput
                    value={description}
                    onChangeText={setDescription}
                    placeholder="Descripción"
                    placeholderTextColor={colors.muted}
                    multiline
                    style={{
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 10,
                      padding: 10,
                      color: colors.foreground,
                      minHeight: 70,
                    }}
                  />
                  <View className="flex-row gap-2">
                    <Pressable
                      onPress={() => void saveEdit()}
                      disabled={saving}
                      style={{
                        flex: 1,
                        backgroundColor: colors.primary,
                        borderRadius: 10,
                        padding: 10,
                        alignItems: "center",
                        opacity: saving ? 0.6 : 1,
                      }}
                    >
                      <Text style={{ color: colors.background, fontWeight: "700" }}>Guardar</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setEditingId(null)}
                      style={{
                        flex: 1,
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderRadius: 10,
                        padding: 10,
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ color: colors.foreground }}>Cancelar</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View className="mt-3 flex-row gap-2">
                  <Pressable
                    onPress={() => startEdit(item)}
                    style={{
                      flex: 1,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: colors.primary,
                      padding: 10,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: colors.primary, fontWeight: "700" }}>Editar</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void pickPhoto(item.id)}
                    style={{
                      flex: 1,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: colors.border,
                      padding: 10,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: colors.foreground }}>Foto</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        }}
      />
    </ScreenContainer>
  );
}
