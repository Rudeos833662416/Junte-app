import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { uploadUriToStorage } from "@/lib/media-upload";
import { Image as ExpoImage } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, Text, View } from "react-native";

type CollageImage = { id: string; image_url: string; storage_path: string; alt_text: string; sort_order: number; is_active: boolean };
// La tabla se incorpora mediante la migración 0047; hasta regenerar database.types,
// aislamos el cast en un único punto en vez de contaminar el resto del componente.
const table = () => supabase.from("home_collage_images" as never) as any;

export function HomeCollageAdmin({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useColors();
  const { user } = useAuth({ autoFetch: true });
  const [isAdmin, setIsAdmin] = useState(false);
  const [items, setItems] = useState<CollageImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
    const admin = Boolean(profile?.is_admin);
    setIsAdmin(admin);
    if (!admin) return;
    setLoading(true);
    const { data, error } = await table().select("id, image_url, storage_path, alt_text, sort_order, is_active").order("sort_order", { ascending: true }).order("created_at", { ascending: true });
    setLoading(false);
    if (error) Alert.alert("Collage", error.message);
    else setItems((data ?? []) as unknown as CollageImage[]);
  }, [user]);

  useEffect(() => {
    if (visible) void load();
  }, [load, visible]);

  const pickImage = async () => {
    if (!user || !isAdmin) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: false, quality: 0.9, selectionLimit: 1 });
    if (result.canceled || !result.assets[0]) return;
    setBusy(true);
    try {
      const asset = result.assets[0];
      const extension = asset.mimeType?.split("/")[1] || "jpg";
      const path = `home-collage/${user.id}/${Date.now()}.${extension}`;
      await uploadUriToStorage("home-collage", path, asset.uri, asset.mimeType || "image/jpeg");
      const { data: publicData } = supabase.storage.from("home-collage").getPublicUrl(path);
      const { error } = await table().insert({
        storage_path: path,
        image_url: publicData.publicUrl,
        alt_text: "Imagen decorativa de Junta2",
        sort_order: items.length,
        is_active: true,
        created_by: user.id,
      });
      if (error) throw error;
      await load();
    } catch (error) {
      Alert.alert("No se pudo subir", error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setBusy(false);
    }
  };

  const updateItem = async (item: CollageImage, patch: Partial<CollageImage>) => {
    setBusy(true);
    const { error } = await table().update(patch).eq("id", item.id);
    setBusy(false);
    if (error) Alert.alert("No se pudo guardar", error.message);
    else await load();
  };

  const moveItem = async (item: CollageImage, direction: -1 | 1) => {
    const index = items.findIndex((entry) => entry.id === item.id);
    const other = items[index + direction];
    if (!other) return;
    setBusy(true);
    const first = await table().update({ sort_order: other.sort_order }).eq("id", item.id);
    const second = await table().update({ sort_order: item.sort_order }).eq("id", other.id);
    setBusy(false);
    if (first.error || second.error) Alert.alert("Orden", first.error?.message || second.error?.message || "No se pudo ordenar");
    else await load();
  };

  const removeItem = (item: CollageImage) => {
    Alert.alert("Eliminar imagen", "Esta acción no se puede deshacer.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: () => void (async () => {
        setBusy(true);
        const { error } = await table().delete().eq("id", item.id);
        if (!error) await supabase.storage.from("home-collage").remove([item.storage_path]);
        setBusy(false);
        if (error) Alert.alert("No se pudo eliminar", error.message);
        else await load();
      })() },
    ]);
  };

  if (!isAdmin && visible) return null;
  return (
    <Modal visible={visible && isAdmin} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.58)" }}>
        <View style={{ maxHeight: "86%", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, backgroundColor: colors.surface }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <View><Text style={{ color: colors.foreground, fontSize: 22, fontWeight: "900" }}>Collage de Home</Text><Text style={{ color: colors.muted, marginTop: 3 }}>Solo los administradores pueden editarlo.</Text></View>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Cerrar panel del collage" style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}><MaterialIcons name="close" size={24} color={colors.muted} /></Pressable>
          </View>
          <Pressable disabled={busy} onPress={() => void pickImage()} accessibilityRole="button" accessibilityLabel="Subir imagen al collage" style={{ minHeight: 52, marginVertical: 14, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, opacity: busy ? 0.55 : 1 }}><Text style={{ color: colors.onPrimary, fontWeight: "900" }}>{busy ? "Guardando…" : "Subir nueva imagen"}</Text></Pressable>
          {loading ? <ActivityIndicator color={colors.primary} /> : <FlatList data={items} keyExtractor={(item) => item.id} contentContainerStyle={{ gap: 10, paddingBottom: 16 }} renderItem={({ item, index }) => (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 8 }}>
              <ExpoImage source={{ uri: item.image_url }} cachePolicy="memory-disk" contentFit="cover" style={{ width: 66, height: 66, borderRadius: 12, backgroundColor: colors.background }} />
              <View style={{ flex: 1 }}><Text style={{ color: colors.foreground, fontWeight: "800" }}>Posición {index + 1}</Text><Text style={{ color: colors.muted, fontSize: 12, marginTop: 3 }}>{item.is_active ? "Visible en Home" : "Oculta"}</Text></View>
              <Pressable onPress={() => void moveItem(item, -1)} disabled={index === 0 || busy} accessibilityLabel="Subir imagen" style={{ minWidth: 40, minHeight: 44, alignItems: "center", justifyContent: "center" }}><MaterialIcons name="keyboard-arrow-up" size={24} color={index === 0 ? colors.border : colors.foreground} /></Pressable>
              <Pressable onPress={() => void moveItem(item, 1)} disabled={index === items.length - 1 || busy} accessibilityLabel="Bajar imagen" style={{ minWidth: 40, minHeight: 44, alignItems: "center", justifyContent: "center" }}><MaterialIcons name="keyboard-arrow-down" size={24} color={index === items.length - 1 ? colors.border : colors.foreground} /></Pressable>
              <Pressable onPress={() => void updateItem(item, { is_active: !item.is_active })} disabled={busy} accessibilityLabel={item.is_active ? "Desactivar imagen" : "Activar imagen"} style={{ minWidth: 40, minHeight: 44, alignItems: "center", justifyContent: "center" }}><MaterialIcons name={item.is_active ? "visibility" : "visibility-off"} size={21} color={colors.primary} /></Pressable>
              <Pressable onPress={() => removeItem(item)} disabled={busy} accessibilityLabel="Eliminar imagen" style={{ minWidth: 40, minHeight: 44, alignItems: "center", justifyContent: "center" }}><MaterialIcons name="delete-outline" size={21} color={colors.error} /></Pressable>
            </View>
          )} ListEmptyComponent={<Text style={{ color: colors.muted, textAlign: "center", paddingVertical: 28 }}>Aún no hay imágenes. Sube hasta crear tu secuencia.</Text>} />}
        </View>
      </View>
    </Modal>
  );
}
