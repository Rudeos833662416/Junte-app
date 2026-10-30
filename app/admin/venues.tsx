import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
  Linking,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { supabase } from "@/lib/supabase";
import {
  createVenueAdmin,
  deleteVenueAdmin,
  updateVenueAdmin,
  uploadVenuePhoto,
} from "@/lib/events-admin";
import { reportError } from "@/lib/report";
import { rankColors, type Venue } from "@/lib/events-shared";

type FormState = {
  name: string;
  description: string;
  address: string;
  city: string;
  website: string;
  rank: string;
  latitude: string;
  longitude: string;
};

const emptyForm = (): FormState => ({
  name: "",
  description: "",
  address: "",
  city: "",
  website: "",
  rank: "",
  latitude: "",
  longitude: "",
});

function formFromVenue(venue: Venue): FormState {
  return {
    name: venue.name ?? "",
    description: venue.description ?? "",
    address: venue.address ?? "",
    city: venue.city ?? "",
    website: venue.website_url ?? "",
    rank: venue.admin_rank != null ? String(venue.admin_rank) : "",
    latitude: venue.latitude != null ? String(venue.latitude) : "",
    longitude: venue.longitude != null ? String(venue.longitude) : "",
  };
}

export default function AdminVenuesScreen() {
  const colors = useColors();
  const { user } = useAuth({ autoFetch: true });
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

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
          "id, name, address, description, city, website_url, latitude, longitude, admin_rank, admin_photo_url",
        )
        .order("admin_rank", { ascending: true, nullsFirst: false })
        .limit(100);
      if (error) {
        const fallback = await supabase
          .from("venues")
          .select(
            "id, name, address, description, city, latitude, longitude, admin_rank, admin_photo_url",
          )
          .order("admin_rank", { ascending: true, nullsFirst: false })
          .limit(100);
        if (fallback.error) throw fallback.error;
        setVenues((fallback.data ?? []) as Venue[]);
        return;
      }
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

  const setField = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const startEdit = (venue: Venue) => {
    setCreating(false);
    setEditingId(venue.id);
    setForm(formFromVenue(venue));
    setStatusMsg(null);
  };

  const startCreate = () => {
    setEditingId(null);
    setCreating(true);
    setForm(emptyForm());
    setStatusMsg(null);
  };

  const cancelForm = () => {
    setEditingId(null);
    setCreating(false);
    setForm(emptyForm());
  };

  const parseCoords = () => {
    const lat = form.latitude.trim() === "" ? null : Number(form.latitude);
    const lng = form.longitude.trim() === "" ? null : Number(form.longitude);
    if (lat != null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) {
      throw new Error("Latitud inválida (−90 a 90)");
    }
    if (lng != null && (!Number.isFinite(lng) || lng < -180 || lng > 180)) {
      throw new Error("Longitud inválida (−180 a 180)");
    }
    return { lat, lng };
  };

  const parseRank = () => {
    const parsed = form.rank.trim() === "" ? null : Number(form.rank);
    if (parsed != null && (!Number.isFinite(parsed) || parsed < 1 || parsed > 99)) {
      throw new Error("El ranking debe ser un número entre 1 y 99");
    }
    return parsed;
  };

  const saveEdit = async () => {
    if (!editingId) return;
    if (!form.name.trim()) {
      Alert.alert("Falta el nombre", "El nombre del local es obligatorio.");
      return;
    }
    setSaving(true);
    setStatusMsg(null);
    try {
      const { lat, lng } = parseCoords();
      await updateVenueAdmin({
        venueId: editingId,
        name: form.name.trim(),
        description: form.description.trim() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        website_url: form.website.trim() || null,
        latitude: lat,
        longitude: lng,
        admin_rank: parseRank(),
      });
      setStatusMsg("Local actualizado");
      setEditingId(null);
      void load();
    } catch (err) {
      reportError(err, { action: "updateVenueAdmin" });
      Alert.alert("No se pudo guardar", err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  const saveCreate = async () => {
    if (!form.name.trim()) {
      Alert.alert("Falta el nombre", "El nombre del local es obligatorio.");
      return;
    }
    setSaving(true);
    setStatusMsg(null);
    try {
      const { lat, lng } = parseCoords();
      await createVenueAdmin({
        name: form.name.trim(),
        description: form.description.trim() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        website_url: form.website.trim() || null,
        latitude: lat,
        longitude: lng,
        admin_rank: parseRank(),
      });
      setStatusMsg("Local creado");
      setCreating(false);
      void load();
    } catch (err) {
      reportError(err, { action: "createVenueAdmin" });
      Alert.alert("No se pudo crear", err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (venue: Venue) => {
    Alert.alert(
      "Eliminar local",
      `¿Eliminar por completo «${venue.name}»? Esta acción no se puede deshacer.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setSaving(true);
              try {
                await deleteVenueAdmin(venue.id);
                if (editingId === venue.id) cancelForm();
                setStatusMsg("Local eliminado");
                void load();
              } catch (err) {
                reportError(err, { action: "deleteVenue" });
                Alert.alert("No se pudo eliminar", err instanceof Error ? err.message : "Error");
              } finally {
                setSaving(false);
              }
            })();
          },
        },
      ],
    );
  };

  const pickPhoto = async (venueId: number) => {
    if (!user) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.9,
    });
    if (result.canceled || !result.assets[0]) return;
    setSaving(true);
    setStatusMsg("Procesando imagen…");
    try {
      const cropped = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 1280 } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
      );
      await uploadVenuePhoto(venueId, cropped.uri);
      setStatusMsg("Foto actualizada");
      void load();
    } catch (err) {
      reportError(err, { action: "venuePhoto" });
      Alert.alert("Foto", err instanceof Error ? err.message : "No se pudo subir");
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.foreground,
    backgroundColor: colors.background,
    marginBottom: 10,
  } as const;

  const renderForm = (mode: "edit" | "create") => (
    <View
      style={{
        marginTop: 12,
        padding: 14,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
      }}
    >
      <Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 16, marginBottom: 10 }}>
        {mode === "create" ? "Nuevo local" : "Editar local"}
      </Text>
      <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>Nombre *</Text>
      <TextInput
        value={form.name}
        onChangeText={(v) => setField("name", v)}
        placeholder="Nombre del local"
        placeholderTextColor={colors.muted}
        style={inputStyle}
      />
      <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>Descripción</Text>
      <TextInput
        value={form.description}
        onChangeText={(v) => setField("description", v)}
        placeholder="Descripción"
        placeholderTextColor={colors.muted}
        multiline
        style={{ ...inputStyle, minHeight: 72, textAlignVertical: "top" }}
      />
      <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>Dirección</Text>
      <TextInput
        value={form.address}
        onChangeText={(v) => setField("address", v)}
        placeholder="Calle, número, zona"
        placeholderTextColor={colors.muted}
        style={inputStyle}
      />
      <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>Ciudad</Text>
      <TextInput
        value={form.city}
        onChangeText={(v) => setField("city", v)}
        placeholder="Ciudad"
        placeholderTextColor={colors.muted}
        style={inputStyle}
      />
      <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>Sitio web</Text>
      <TextInput
        value={form.website}
        onChangeText={(v) => setField("website", v)}
        placeholder="https://"
        autoCapitalize="none"
        keyboardType="url"
        placeholderTextColor={colors.muted}
        style={inputStyle}
      />
      <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>Ranking (1–99)</Text>
      <TextInput
        value={form.rank}
        onChangeText={(v) => setField("rank", v)}
        placeholder="Ej. 1"
        keyboardType="number-pad"
        placeholderTextColor={colors.muted}
        style={inputStyle}
      />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>Latitud</Text>
          <TextInput
            value={form.latitude}
            onChangeText={(v) => setField("latitude", v)}
            placeholder="10.48"
            keyboardType="decimal-pad"
            placeholderTextColor={colors.muted}
            style={inputStyle}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>Longitud</Text>
          <TextInput
            value={form.longitude}
            onChangeText={(v) => setField("longitude", v)}
            placeholder="-66.90"
            keyboardType="decimal-pad"
            placeholderTextColor={colors.muted}
            style={inputStyle}
          />
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
        <Pressable
          onPress={() => void (mode === "create" ? saveCreate() : saveEdit())}
          disabled={saving}
          style={{
            flex: 1,
            backgroundColor: colors.primary,
            borderRadius: 12,
            paddingVertical: 12,
            alignItems: "center",
            opacity: saving ? 0.6 : 1,
          }}
        >
          <Text style={{ color: colors.background, fontWeight: "700" }}>
            {saving ? "Guardando…" : "Guardar"}
          </Text>
        </Pressable>
        <Pressable
          onPress={cancelForm}
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            paddingVertical: 12,
            alignItems: "center",
          }}
        >
          <Text style={{ color: colors.foreground }}>Cancelar</Text>
        </Pressable>
      </View>
    </View>
  );

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
          Esta pantalla gestiona ranking, datos y fotos de locales.
        </Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="p-4">
      <View className="mb-3 flex-row items-center justify-between">
        <View className="flex-row items-center gap-3">
          <Pressable onPress={() => router.back()}>
            <Text className="text-2xl" style={{ color: colors.primary }}>
              ‹
            </Text>
          </Pressable>
          <Text className="text-2xl font-bold text-foreground">Admin · Locales</Text>
        </View>
        <Pressable
          onPress={startCreate}
          style={{
            borderRadius: 999,
            backgroundColor: colors.primary,
            paddingHorizontal: 14,
            paddingVertical: 8,
          }}
        >
          <Text style={{ color: colors.background, fontWeight: "700", fontSize: 13 }}>+ Nuevo</Text>
        </Pressable>
      </View>

      {statusMsg ? (
        <View
          style={{
            marginBottom: 10,
            borderRadius: 12,
            backgroundColor: `${colors.primary}18`,
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 13 }}>{statusMsg}</Text>
        </View>
      ) : null}

      {creating ? renderForm("create") : null}

      <FlatList
        data={venues}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingBottom: 48, gap: 12, paddingTop: creating ? 12 : 0 }}
        ListEmptyComponent={<Text className="text-muted">No hay locales todavía.</Text>}
        renderItem={({ item }) => {
          const rankColor =
            item.admin_rank != null && item.admin_rank <= rankColors.length
              ? rankColors[item.admin_rank - 1]
              : colors.muted;
          const editing = editingId === item.id;
          return (
            <View
              style={{
                borderRadius: 18,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                overflow: "hidden",
              }}
            >
              {item.admin_photo_url ? (
                <ExpoImage
                  source={{ uri: item.admin_photo_url }}
                  style={{ width: "100%", height: 140 }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
              ) : (
                <View
                  style={{
                    height: 72,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: `${colors.primary}12`,
                  }}
                >
                  <Text style={{ color: colors.muted, fontSize: 12 }}>Sin foto</Text>
                </View>
              )}
              <View style={{ padding: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ flex: 1, color: colors.foreground, fontWeight: "700", fontSize: 16 }}>
                    {item.name}
                  </Text>
                  {item.admin_rank != null ? (
                    <Text style={{ color: rankColor, fontWeight: "800" }}>#{item.admin_rank}</Text>
                  ) : (
                    <Text style={{ color: colors.muted, fontSize: 11 }}>Sin rank</Text>
                  )}
                </View>
                {item.address || item.city ? (
                  <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }} numberOfLines={2}>
                    {[item.address, item.city].filter(Boolean).join(" · ")}
                  </Text>
                ) : null}
                {item.description ? (
                  <Text style={{ color: colors.muted, fontSize: 13, marginTop: 6 }} numberOfLines={3}>
                    {item.description}
                  </Text>
                ) : null}
                {item.website_url ? (
                  <Pressable onPress={() => void Linking.openURL(item.website_url!)}>
                    <Text style={{ color: colors.primary, fontSize: 12, marginTop: 6 }} numberOfLines={1}>
                      {item.website_url}
                    </Text>
                  </Pressable>
                ) : null}

                {editing ? (
                  renderForm("edit")
                ) : (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                    <Pressable
                      onPress={() => startEdit(item)}
                      style={{
                        flexGrow: 1,
                        minWidth: "30%",
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: colors.primary,
                        paddingVertical: 10,
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 13 }}>Editar</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => void pickPhoto(item.id)}
                      disabled={saving}
                      style={{
                        flexGrow: 1,
                        minWidth: "30%",
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: colors.border,
                        paddingVertical: 10,
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ color: colors.foreground, fontSize: 13 }}>Foto</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => confirmDelete(item)}
                      style={{
                        flexGrow: 1,
                        minWidth: "30%",
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: "#ef4444",
                        paddingVertical: 10,
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ color: "#ef4444", fontWeight: "700", fontSize: 13 }}>Eliminar</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </View>
          );
        }}
      />
    </ScreenContainer>
  );
}
