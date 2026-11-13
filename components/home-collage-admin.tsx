import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { COLLAGE_PRESETS, DEFAULT_HOME_COLLAGE_SETTINGS, HomeCollageSettings, normalizeHomeCollageSettings } from "@/lib/home-collage-settings";
import { supabase } from "@/lib/supabase";
import { uploadUriToStorage } from "@/lib/media-upload";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image as ExpoImage } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, View } from "react-native";

type CollageTheme = "light" | "dark";
type CollageImage = { id: string; image_url: string; storage_path: string; alt_text: string; sort_order: number; is_active: boolean; theme: CollageTheme; is_published: boolean };
const PREVIEW_KEY = "junta2_collage_preview_theme";
const imagesTable = () => supabase.from("home_collage_images" as never) as any;
const settingsTable = () => supabase.from("home_collage_settings" as never) as any;

function Stepper({ label, value, suffix, min, max, step, onChange, colors }: { label: string; value: number; suffix: string; min: number; max: number; step: number; onChange: (value: number) => void; colors: ReturnType<typeof useColors> }) {
  return <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}><View style={{ flex: 1 }}><Text style={{ color: colors.foreground, fontWeight: "800" }}>{label}</Text><Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>Borrador de este tema</Text></View><Pressable onPress={() => onChange(Math.max(min, Number((value - step).toFixed(2))))} accessibilityRole="button" accessibilityLabel={`Disminuir ${label}`} style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}><MaterialIcons name="remove-circle-outline" size={24} color={colors.foreground} /></Pressable><Text style={{ minWidth: 54, textAlign: "center", color: colors.primary, fontWeight: "900" }}>{value}{suffix}</Text><Pressable onPress={() => onChange(Math.min(max, Number((value + step).toFixed(2))))} accessibilityRole="button" accessibilityLabel={`Aumentar ${label}`} style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}><MaterialIcons name="add-circle-outline" size={24} color={colors.foreground} /></Pressable></View>;
}

export function HomeCollageAdmin({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useColors();
  const { user } = useAuth({ autoFetch: true });
  const [isAdmin, setIsAdmin] = useState(false);
  const [theme, setTheme] = useState<CollageTheme>("light");
  const selectedTheme = theme;
  const [items, setItems] = useState<CollageImage[]>([]);
  const [settings, setSettings] = useState<HomeCollageSettings>(DEFAULT_HOME_COLLAGE_SETTINGS);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [previewEnabled, setPreviewEnabled] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: profile }, { data, error }, { data: settingData }] = await Promise.all([
      supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle(),
      imagesTable().select("id, image_url, storage_path, alt_text, sort_order, is_active, theme, is_published").eq("theme", selectedTheme).eq("is_published", false).order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
      settingsTable().select("image_opacity, brightness, contrast, overlay_color, overlay_opacity, fade_duration_ms, hold_duration_ms, transition_type, shuffle_enabled, autoplay_enabled").eq("theme", selectedTheme).eq("is_published", false).maybeSingle(),
    ]);
    const admin = Boolean(profile?.is_admin);
    setIsAdmin(admin);
    if (!admin) return;
    if (error) Alert.alert("Collage", error.message);
    setItems((data ?? []) as CollageImage[]);
    setSettings(normalizeHomeCollageSettings(settingData));
    setLoading(false);
  }, [theme, user?.id]);

  useEffect(() => { if (visible) void load(); }, [load, visible]);
  useEffect(() => { setSelectedIds([]); }, [theme]);

  const pickImages = async () => {
    if (!user || !isAdmin) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: false, allowsMultipleSelection: true, selectionLimit: 50, quality: 0.9 });
    if (result.canceled || !result.assets.length) return;
    setBusy(true);
    let completed = 0;
    try {
      for (const asset of result.assets) {
        const extension = asset.mimeType?.split("/")[1] || "jpg";
        const path = `home-collage/${user.id}/${theme}/${Date.now()}-${completed}.${extension}`;
        await uploadUriToStorage("home-collage", path, asset.uri, asset.mimeType || "image/jpeg");
        const { data: publicData } = supabase.storage.from("home-collage").getPublicUrl(path);
        const { error } = await imagesTable().insert({ storage_path: path, image_url: publicData.publicUrl, alt_text: "Imagen decorativa de Junta2", sort_order: items.length + completed, is_active: true, created_by: user.id, theme, is_published: false });
        if (error) throw error;
        completed += 1;
        setUploadProgress(`Subiendo ${completed} de ${result.assets.length}`);
      }
      await load();
    } catch (error) {
      Alert.alert("Borrador incompleto", `${completed} foto(s) guardada(s). ${error instanceof Error ? error.message : "Puedes reintentar las restantes."}`);
      await load();
    } finally { setBusy(false); setUploadProgress(""); }
  };

  const updateSettings = async (patch: Partial<HomeCollageSettings>) => {
    const next = normalizeHomeCollageSettings({ ...settings, ...patch });
    setSettings(next);
    const { error } = await settingsTable().update({ ...next, updated_by: user?.id }).eq("theme", theme).eq("is_published", false);
    if (error) { setSettings(settings); Alert.alert("No se pudo guardar el borrador", error.message); }
  };

  const togglePreview = async () => {
    const next = !previewEnabled;
    setPreviewEnabled(next);
    if (next) await AsyncStorage.setItem(PREVIEW_KEY, theme);
    else await AsyncStorage.removeItem(PREVIEW_KEY);
    Alert.alert("Vista previa", next ? "El collage de este tema ya se muestra en tu dispositivo. Puedes cerrar este panel." : "La vista previa local se desactivó.");
  };

  const publish = () => Alert.alert("Publicar cambios", `Se publicará el borrador del modo ${theme === "dark" ? "oscuro" : "claro"} para todos los usuarios.`, [{ text: "Cancelar", style: "cancel" }, { text: "Publicar", onPress: () => void (async () => { setBusy(true); const { error } = await supabase.rpc("publish_home_collage", { p_theme: theme }); setBusy(false); if (error) Alert.alert("No se pudo publicar", error.message); else { await AsyncStorage.removeItem(PREVIEW_KEY); setPreviewEnabled(false); Alert.alert("Publicado", "Los cambios ya están sincronizados en los dispositivos."); await load(); } })() }]);

  const toggleSelected = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const deleteSelected = () => {
    if (!selectedIds.length) return;
    Alert.alert("Eliminar del borrador", `Se eliminarán ${selectedIds.length} imágenes del borrador.`, [{ text: "Cancelar", style: "cancel" }, { text: "Eliminar", style: "destructive", onPress: () => void (async () => { setBusy(true); const { error } = await imagesTable().delete().in("id", selectedIds).eq("is_published", false); setBusy(false); if (error) Alert.alert("No se pudo eliminar", error.message); else { setSelectedIds([]); await load(); } })() }]);
  };

  const moveItem = async (item: CollageImage, direction: -1 | 1) => {
    const index = items.findIndex((entry) => entry.id === item.id); const other = items[index + direction]; if (!other) return;
    setBusy(true);
    const first = await imagesTable().update({ sort_order: other.sort_order }).eq("id", item.id).eq("is_published", false);
    const second = await imagesTable().update({ sort_order: item.sort_order }).eq("id", other.id).eq("is_published", false);
    setBusy(false);
    if (first.error || second.error) Alert.alert("Orden", first.error?.message || second.error?.message || "No se pudo ordenar"); else await load();
  };

  if (!isAdmin && visible) return null;
  return <Modal visible={visible && isAdmin} transparent animationType="slide" onRequestClose={onClose}><View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.62)" }}><View style={{ maxHeight: "94%", borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: colors.surface }}><ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 34 }}>
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}><View><Text style={{ color: colors.foreground, fontSize: 22, fontWeight: "900" }}>Collage de Home</Text><Text style={{ color: colors.muted, marginTop: 3 }}>Edita un borrador y publícalo cuando esté listo</Text></View><Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Cerrar panel del collage" style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}><MaterialIcons name="close" size={24} color={colors.muted} /></Pressable></View>
    <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>{(["light", "dark"] as CollageTheme[]).map((value) => <Pressable key={value} onPress={() => setTheme(value)} accessibilityRole="radio" accessibilityState={{ selected: theme === value }} style={{ flex: 1, minHeight: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: theme === value ? colors.primary : colors.background }}><Text style={{ color: theme === value ? colors.onPrimary : colors.foreground, fontWeight: "900" }}>{value === "dark" ? "Modo oscuro" : "Modo claro"}</Text></Pressable>)}</View>
    <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}><Pressable disabled={busy} onPress={() => void togglePreview()} accessibilityRole="button" accessibilityLabel="Previsualizar borrador en este dispositivo" style={{ flex: 1, minHeight: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.primary }}><Text style={{ color: colors.primary, fontWeight: "900" }}>{previewEnabled ? "Salir de preview" : "Previsualizar"}</Text></Pressable><Pressable disabled={busy} onPress={publish} accessibilityRole="button" accessibilityLabel="Publicar cambios del collage" style={{ flex: 1, minHeight: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, opacity: busy ? 0.55 : 1 }}><Text style={{ color: colors.onPrimary, fontWeight: "900" }}>Publicar cambios</Text></Pressable></View>
    <Pressable disabled={busy} onPress={() => void pickImages()} accessibilityRole="button" accessibilityLabel="Agregar varias fotos al borrador" style={{ minHeight: 52, marginTop: 14, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, opacity: busy ? 0.55 : 1 }}><Text style={{ color: colors.onPrimary, fontWeight: "900" }}>{uploadProgress || `Agregar fotos al modo ${theme === "dark" ? "oscuro" : "claro"}`}</Text></Pressable>
    <Text style={{ color: colors.foreground, fontSize: 17, fontWeight: "900", marginTop: 22 }}>Apariencia del borrador</Text><View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>{Object.values(COLLAGE_PRESETS).map((preset) => <Pressable key={preset.label} onPress={() => void updateSettings(preset)} accessibilityRole="button" accessibilityLabel={`Aplicar preset ${preset.label}`} style={{ flex: 1, borderRadius: 12, paddingVertical: 11, alignItems: "center", backgroundColor: settings.overlay_color === preset.overlay_color ? colors.primary : colors.background }}><Text style={{ color: settings.overlay_color === preset.overlay_color ? colors.onPrimary : colors.foreground, fontWeight: "800", fontSize: 12 }}>{preset.label}</Text></Pressable>)}</View>
    <Stepper label="Opacidad" value={Math.round(settings.image_opacity * 100)} suffix="%" min={0} max={100} step={5} onChange={(value) => void updateSettings({ image_opacity: value / 100 })} colors={colors} /><Stepper label="Iluminación" value={Math.round(settings.brightness * 100)} suffix="%" min={-35} max={35} step={5} onChange={(value) => void updateSettings({ brightness: value / 100 })} colors={colors} /><Stepper label="Contraste" value={Math.round(settings.contrast * 100)} suffix="%" min={0} max={50} step={5} onChange={(value) => void updateSettings({ contrast: value / 100 })} colors={colors} /><Stepper label="Velo de color" value={Math.round(settings.overlay_opacity * 100)} suffix="%" min={0} max={75} step={5} onChange={(value) => void updateSettings({ overlay_opacity: value / 100 })} colors={colors} />
    <Pressable onPress={() => void updateSettings({ overlay_color: settings.overlay_color === "#FFF1D0" ? "#0A0A0A" : "#FFF1D0" })} accessibilityRole="button" accessibilityLabel="Cambiar color del velo" style={{ marginTop: 12, minHeight: 46, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: settings.overlay_color, borderWidth: 1, borderColor: colors.border }}><Text style={{ color: settings.overlay_color === "#FFF1D0" ? "#0A0A0A" : "#FFFFFF", fontWeight: "900" }}>Color del velo: {settings.overlay_color}</Text></Pressable>
    <Text style={{ color: colors.foreground, fontSize: 17, fontWeight: "900", marginTop: 22 }}>Animación</Text><View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}><Pressable onPress={() => void updateSettings({ transition_type: "crossfade" })} accessibilityRole="radio" accessibilityState={{ selected: settings.transition_type === "crossfade" }} style={{ flex: 1, padding: 12, borderRadius: 12, alignItems: "center", backgroundColor: settings.transition_type === "crossfade" ? colors.primary : colors.background }}><Text style={{ color: settings.transition_type === "crossfade" ? colors.onPrimary : colors.foreground, fontWeight: "800" }}>Crossfade</Text></Pressable><Pressable onPress={() => void updateSettings({ transition_type: "instant" })} accessibilityRole="radio" accessibilityState={{ selected: settings.transition_type === "instant" }} style={{ flex: 1, padding: 12, borderRadius: 12, alignItems: "center", backgroundColor: settings.transition_type === "instant" ? colors.primary : colors.background }}><Text style={{ color: settings.transition_type === "instant" ? colors.onPrimary : colors.foreground, fontWeight: "800" }}>Instantáneo</Text></Pressable></View><Stepper label="Duración del fundido" value={Math.round(settings.fade_duration_ms / 100) / 10} suffix=" s" min={3} max={3.5} step={0.5} onChange={(value) => void updateSettings({ fade_duration_ms: Math.round(value * 1000) })} colors={colors} /><Stepper label="Tiempo visible" value={Math.round(settings.hold_duration_ms / 1000)} suffix=" s" min={3} max={30} step={1} onChange={(value) => void updateSettings({ hold_duration_ms: value * 1000 })} colors={colors} />
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 22 }}><View><Text style={{ color: colors.foreground, fontSize: 17, fontWeight: "900" }}>Biblioteca del borrador</Text><Text style={{ color: colors.muted, marginTop: 3 }}>{items.length} fotos · {selectedIds.length} seleccionadas</Text></View>{selectedIds.length ? <Pressable onPress={deleteSelected} disabled={busy} accessibilityRole="button" accessibilityLabel="Eliminar seleccionadas" style={{ minHeight: 44, paddingHorizontal: 12, borderRadius: 12, justifyContent: "center", backgroundColor: colors.error }}><Text style={{ color: "#fff", fontWeight: "900" }}>Eliminar</Text></Pressable> : null}</View>
    {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} /> : items.length ? items.map((item, index) => { const selected = selectedIds.includes(item.id); return <View key={item.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: selected ? colors.primary : colors.border, borderRadius: 17, padding: 8, marginTop: 10, backgroundColor: selected ? `${colors.primary}12` : colors.surface }}><Pressable onPress={() => toggleSelected(item.id)} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={`Seleccionar foto ${index + 1}`}><ExpoImage source={{ uri: item.image_url }} cachePolicy="memory-disk" contentFit="cover" style={{ width: 62, height: 62, borderRadius: 12, backgroundColor: colors.background }} /></Pressable><View style={{ flex: 1 }}><Text style={{ color: colors.foreground, fontWeight: "800" }}>Foto {index + 1}</Text><Text style={{ color: colors.muted, fontSize: 12, marginTop: 3 }}>Borrador · {item.is_active ? "visible" : "oculta"}</Text></View><Pressable onPress={() => void moveItem(item, -1)} disabled={index === 0 || busy} accessibilityLabel="Subir imagen" style={{ minWidth: 40, minHeight: 44, alignItems: "center", justifyContent: "center" }}><MaterialIcons name="keyboard-arrow-up" size={23} color={index === 0 ? colors.border : colors.foreground} /></Pressable><Pressable onPress={() => void moveItem(item, 1)} disabled={index === items.length - 1 || busy} accessibilityLabel="Bajar imagen" style={{ minWidth: 40, minHeight: 44, alignItems: "center", justifyContent: "center" }}><MaterialIcons name="keyboard-arrow-down" size={23} color={index === items.length - 1 ? colors.border : colors.foreground} /></Pressable><Pressable onPress={() => void imagesTable().update({ is_active: !item.is_active }).eq("id", item.id).eq("is_published", false).then(() => load())} disabled={busy} accessibilityLabel={item.is_active ? "Ocultar imagen" : "Mostrar imagen"} style={{ minWidth: 40, minHeight: 44, alignItems: "center", justifyContent: "center" }}><MaterialIcons name={item.is_active ? "visibility" : "visibility-off"} size={21} color={colors.primary} /></Pressable></View>; }) : <Text style={{ color: colors.muted, textAlign: "center", paddingVertical: 28 }}>No hay imágenes en este borrador.</Text>}
  </ScrollView></View></View></Modal>;
}
