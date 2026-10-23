import { Alert, ActivityIndicator, ScrollView, Text, TextInput, View, Pressable, Switch, Platform } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { useAppRefresh } from "@/lib/app-refresh";
import { supabase } from "@/lib/supabase";
import { clearProfileLocation } from "@/lib/location-sharing";
import { useCallback, useEffect, useState } from "react";
import { KeyboardAvoidingView } from "react-native";
import { IconSymbol } from "@/components/ui/icon-symbol";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { Image as ExpoImage } from "expo-image";
import { router } from "expo-router";
import { uploadUriToStorage, verifyPublicStorageUrl } from "@/lib/media-upload";

type RecentCheckin = {
  id: number;
  venueName: string;
  createdAt: string;
};

type UploadKind = "avatar" | "cover";
type UploadState = { kind: UploadKind; progress: number; message: string };
type StorageReference = { bucket: string; path: string };

const MAX_PROFILE_IMAGE_BYTES = 2_500_000;

async function prepareProfileImage(uri: string, kind: UploadKind) {
  const maxWidth = kind === "avatar" ? 720 : 1600;
  return ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: maxWidth } }],
    { format: ImageManipulator.SaveFormat.PNG },
  );
}

function parseStorageReference(value: string | null): StorageReference | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    const marker = "/storage/v1/object/public/";
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex < 0) return null;
    const remainder = parsed.pathname.slice(markerIndex + marker.length);
    const slashIndex = remainder.indexOf("/");
    if (slashIndex <= 0) return null;
    return {
      bucket: remainder.slice(0, slashIndex),
      path: decodeURIComponent(remainder.slice(slashIndex + 1)),
    };
  } catch {
    return null;
  }
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

/** Perfil conectado únicamente a la sesión y a los datos reales del usuario. */
export default function ProfileScreen() {
  const colors = useColors();
  const { user, loading: authLoading, logout } = useAuth({ autoFetch: true });
  const { revision } = useAppRefresh();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [locationSharing, setLocationSharing] = useState(true);
  const [isPublicProfile, setIsPublicProfile] = useState(false);
  const [discoverableNearby, setDiscoverableNearby] = useState(false);
  const [checkinCount, setCheckinCount] = useState(0);
  const [visitedVenueCount, setVisitedVenueCount] = useState(0);
  const [recentCheckins, setRecentCheckins] = useState<RecentCheckin[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<UploadState | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [profileName, setProfileName] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [nameLastChangedAt, setNameLastChangedAt] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [isSavingName, setIsSavingName] = useState(false);
  const [bio, setBio] = useState("");
  const [bioDraft, setBioDraft] = useState("");
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [isSavingBio, setIsSavingBio] = useState(false);

  const fetchProfileData = useCallback(async () => {
    if (!user) {
      setCheckinCount(0);
      setVisitedVenueCount(0);
      setRecentCheckins([]);
      setIsLoadingData(false);
      return;
    }

    try {
      setIsLoadingData(true);
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("name, bio, avatar_url, cover_url, is_public, discoverable_nearby, location_sharing, last_name_changed_at")
        .eq("id", user.id)
        .maybeSingle();
      if (!profileError) {
        setProfileName(profileData?.name?.trim() || user.name || user.email?.split("@")[0] || "");
        setNameLastChangedAt(profileData?.last_name_changed_at ?? null);
        setBio(profileData?.bio?.trim() || "");
        setAvatarUrl(profileData?.avatar_url ? `${profileData.avatar_url}?t=${Date.now()}` : null);
        setCoverUrl(profileData?.cover_url ? `${profileData.cover_url}?t=${Date.now()}` : null);
        setIsPublicProfile(Boolean(profileData?.is_public));
        setDiscoverableNearby(Boolean(profileData?.discoverable_nearby));
        setLocationSharing(profileData?.location_sharing !== false);
      } else {
        const { data: legacyProfile } = await supabase
          .from("profiles")
          .select("name, avatar_url, cover_url")
          .eq("id", user.id)
          .maybeSingle();
        setProfileName(legacyProfile?.name?.trim() || user.name || user.email?.split("@")[0] || "");
        setNameLastChangedAt(null);
        setBio("");
        setAvatarUrl(legacyProfile?.avatar_url ?? null);
        setCoverUrl(legacyProfile?.cover_url ?? null);
        setIsPublicProfile(false);
        setDiscoverableNearby(false);
        setLocationSharing(true);
      }

      const { data, error } = await supabase
        .from("checkins")
        .select("id, created_at, venues(name)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;

      const rows = (data ?? []) as {
        id: number;
        created_at: string;
        venues: { name?: string | null } | null;
      }[];
      const venueNames = new Set(rows.map((row) => row.venues?.name).filter(Boolean));

      setCheckinCount(rows.length);
      setVisitedVenueCount(venueNames.size);
      setRecentCheckins(
        rows.slice(0, 3).flatMap((row) => {
          const venueName = row.venues?.name?.trim();
          return venueName ? [{ id: row.id, venueName, createdAt: row.created_at }] : [];
        }),
      );
    } catch (error) {
      console.error("Error loading profile data:", error);
      setCheckinCount(0);
      setVisitedVenueCount(0);
      setRecentCheckins([]);
    } finally {
      setIsLoadingData(false);
    }
  }, [user]);

  useEffect(() => {
    void fetchProfileData();
    if (!user) return;
    const channel = supabase
      .channel(`tragos-sociales-profile-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `id=eq.${user.id}` }, () => void fetchProfileData())
      .on("postgres_changes", { event: "*", schema: "public", table: "checkins", filter: `user_id=eq.${user.id}` }, () => void fetchProfileData())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchProfileData, revision, user]);

  const uploadProfileImage = async (kind: UploadKind) => {
    if (!user || uploadState) return;
    setUploadNotice(null);
    let uploadedPath: string | null = null;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permiso necesario", "Permite el acceso a tus fotos para actualizar tu perfil.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: kind === "avatar" ? [1, 1] : [16, 9],
        quality: 0.82,
        base64: Platform.OS === "web",
      });
      if (result.canceled || !result.assets[0]) return;

      const label = kind === "avatar" ? "foto de perfil" : "portada";
      const previousUrl = kind === "avatar" ? avatarUrl : coverUrl;
      setUploadState({ kind, progress: 10, message: `Preparando tu ${label}…` });
      const asset = result.assets[0];
      const sourceUri = Platform.OS === "web" && asset.base64
        ? `data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`
        : asset.uri;
      const prepared = await prepareProfileImage(sourceUri, kind);
      setUploadState({ kind, progress: 32, message: "Procesando y comprimiendo la imagen…" });
      const path = `${user.id}/profile/${kind}_${Date.now()}.png`;
      uploadedPath = path;
      setUploadState({ kind, progress: 58, message: "Subiendo una versión optimizada…" });
      await uploadUriToStorage("profiles", path, prepared.uri, "image/png");

      setUploadState({ kind, progress: 85, message: "Guardando en tu perfil…" });
      const publicUrl = await verifyPublicStorageUrl("profiles", path, "image");

      const column = kind === "avatar" ? "avatar_url" : "cover_url";
      const { data: savedProfile, error: profileError } = await supabase
        .from("profiles")
        .update({ [column]: publicUrl })
        .eq("id", user.id)
        .select(column)
        .single();
      if (profileError) throw profileError;
      if ((savedProfile as Record<string, unknown> | null)?.[column] !== publicUrl) {
        throw new Error("La imagen se subió, pero Supabase no confirmó la actualización del perfil.");
      }

      const bustedUrl = `${publicUrl}${publicUrl.includes("?") ? "&" : "?"}t=${Date.now()}`;
      if (kind === "avatar") setAvatarUrl(bustedUrl);
      else setCoverUrl(bustedUrl);

      const previousReference = parseStorageReference(previousUrl);
      const safePreviousPrefix = `${user.id}/profile/${kind}_`;
      if (
        previousReference
        && (previousReference.bucket === "profiles" || previousReference.bucket === "stories")
        && previousReference.path.startsWith(safePreviousPrefix)
        && previousReference.path !== path
      ) {
        setUploadState({ kind, progress: 92, message: "Limpiando la versión anterior…" });
        const { error: cleanupError } = await supabase.storage.from(previousReference.bucket).remove([previousReference.path]);
        if (cleanupError) console.warn("No se pudo limpiar la imagen anterior:", cleanupError);
      }

      setUploadState({ kind, progress: 100, message: "Cambio guardado correctamente" });
      setUploadNotice(kind === "avatar" ? "Tu foto de perfil se actualizó." : "Tu foto de portada se actualizó.");
      await new Promise((resolve) => setTimeout(resolve, 650));
      uploadedPath = null;
    } catch (error) {
      if (uploadedPath) {
        const { error: rollbackError } = await supabase.storage.from("profiles").remove([uploadedPath]);
        if (rollbackError) console.warn("No se pudo limpiar la nueva imagen tras el error:", rollbackError);
      }
      Alert.alert("No se pudo actualizar el perfil", error instanceof Error ? error.message : "Inténtalo de nuevo.");
    } finally {
      setUploadState(null);
    }
  };

  const getNameAvailableAt = () => {
    if (!nameLastChangedAt) return null;
    return new Date(nameLastChangedAt).getTime() + 7 * 24 * 60 * 60 * 1000;
  };

  const handleStartNameEdit = () => {
    const availableAt = getNameAvailableAt();
    if (availableAt && Date.now() < availableAt) {
      const days = Math.ceil((availableAt - Date.now()) / (24 * 60 * 60 * 1000));
      Alert.alert("Cambio de nombre limitado", `Podrás cambiar tu nombre nuevamente en ${days} día${days === 1 ? "" : "s"}.`);
      return;
    }
    setNameDraft(profileName);
    setIsEditingName(true);
    setUploadNotice(null);
  };

  const handleCancelNameEdit = () => {
    if (!isSavingName) {
      setNameDraft(profileName);
      setIsEditingName(false);
    }
  };

  const handleSaveName = async () => {
    if (!user || isSavingName) return;
    const nextName = nameDraft.trim().replace(/\s+/g, " ");
    if (nextName.length < 2 || nextName.length > 20) {
      Alert.alert("Nombre no válido", "Usa un nombre de entre 2 y 20 caracteres.");
      return;
    }
    const availableAt = getNameAvailableAt();
    if (availableAt && Date.now() < availableAt) {
      handleStartNameEdit();
      return;
    }
    try {
      setIsSavingName(true);
      const { data, error } = await supabase
        .from("profiles")
        .update({ name: nextName })
        .eq("id", user.id)
        .select("name, last_name_changed_at")
        .maybeSingle();
      if (error) {
        if (error.message.includes("last_name_changed_at") || error.code === "42703") {
          throw new Error("Primero ejecuta la migración 0009 en Supabase para activar el límite de 7 días.");
        }
        throw error;
      }
      if (!data) throw new Error("No se encontró tu perfil para guardar el nombre.");
      setProfileName(data.name?.trim() || nextName);
      setNameLastChangedAt(data.last_name_changed_at ?? new Date().toISOString());
      setIsEditingName(false);
      Alert.alert("Nombre actualizado", "Podrás modificarlo nuevamente dentro de 7 días.");
    } catch (error) {
      Alert.alert("No se pudo actualizar el nombre", error instanceof Error ? error.message : "Inténtalo de nuevo.");
    } finally {
      setIsSavingName(false);
    }
  };

  const handleStartBioEdit = () => {
    setBioDraft(bio);
    setIsEditingBio(true);
    setUploadNotice(null);
  };

  const handleCancelBioEdit = () => {
    if (!isSavingBio) {
      setBioDraft(bio);
      setIsEditingBio(false);
    }
  };

  const handleSaveBio = async () => {
    if (!user || isSavingBio) return;
    const nextBio = bioDraft.trim().replace(/\s+/g, " ");
    if (nextBio.length > 280) {
      Alert.alert("Biografía demasiado larga", "Puedes escribir hasta 280 caracteres.");
      return;
    }
    try {
      setIsSavingBio(true);
      const { error } = await supabase.from("profiles").update({ bio: nextBio || null }).eq("id", user.id);
      if (error) {
        if (error.message.includes("bio") || error.code === "42703") {
          throw new Error("Primero ejecuta la migración 0010 en Supabase para activar la biografía.");
        }
        throw error;
      }
      setBio(nextBio);
      setIsEditingBio(false);
    } catch (error) {
      Alert.alert("No se pudo guardar la biografía", error instanceof Error ? error.message : "Inténtalo de nuevo.");
    } finally {
      setIsSavingBio(false);
    }
  };

  const handleToggleNotifications = () => {
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setNotificationsEnabled((current) => !current);
  };

  const updatePrivacySetting = async (field: "is_public" | "discoverable_nearby" | "location_sharing", value: boolean) => {
    if (!user) return;
    try {
      const { error } = await supabase.from("profiles").update({ [field]: value }).eq("id", user.id);
      if (error) throw error;
      if (field === "is_public") setIsPublicProfile(value);
      if (field === "discoverable_nearby") setDiscoverableNearby(value);
      if (field === "location_sharing") {
        setLocationSharing(value);
        if (!value) await clearProfileLocation(user.id);
      }
      if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      Alert.alert("No se pudo guardar", error instanceof Error ? error.message : "Revisa la conexión e inténtalo de nuevo.");
    }
  };

  const handleToggleLocation = () => {
    void updatePrivacySetting("location_sharing", !locationSharing);
  };

  const handleTogglePublicProfile = () => {
    void updatePrivacySetting("is_public", !isPublicProfile);
  };

  const handleToggleNearby = () => {
    if (!isPublicProfile && !discoverableNearby) {
      Alert.alert("Activa primero tu perfil público", "Para aparecer a personas cercanas, primero debes permitir que tu perfil sea público.");
      return;
    }
    void updatePrivacySetting("discoverable_nearby", !discoverableNearby);
  };

  const handleLogout = () => {
    Alert.alert("Cerrar sesión", "¿Quieres cerrar la sesión de esta cuenta?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Cerrar sesión",
        style: "destructive",
        onPress: () => {
          if (Platform.OS !== "web") {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }
          void logout().catch((error) => {
            Alert.alert("Error", error instanceof Error ? error.message : "No se pudo cerrar la sesión.");
          });
        },
      },
    ]);
  };

  if (authLoading) {
    return (
      <ScreenContainer className="items-center justify-center p-6">
        <ActivityIndicator color={colors.primary} />
        <Text className="mt-3 text-sm text-muted">Cargando tu perfil…</Text>
      </ScreenContainer>
    );
  }

  const displayName = user?.name || user?.email?.split("@")[0] || "";
  const email = user?.email || "";

  return (
    <ScreenContainer className="px-5 pt-3">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
        {/* Encabezado de perfil estilo alta gama */}
        <View className="mb-6 overflow-hidden rounded-3xl border shadow-lg" style={{ borderColor: `${colors.border}AA`, backgroundColor: colors.surface }}>
          <Pressable disabled={Boolean(uploadState)} onPress={() => void uploadProfileImage("cover")} style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}>
            <View className="relative h-44 w-full bg-midnight">
              {coverUrl ? (
                <ExpoImage source={{ uri: coverUrl }} style={{ width: "100%", height: "100%" }} className="h-full w-full" contentFit="cover" cachePolicy="none" transition={200} onError={(event) => console.warn("No se pudo renderizar la portada:", event.error)} />
              ) : (
                <View className="h-full w-full items-center justify-center" style={{ backgroundColor: `${colors.primary}18` }}>
                  <IconSymbol name="photo.fill" size={36} color={colors.primary} />
                  <Text className="mt-2 text-xs font-bold uppercase tracking-wider text-muted">Toca para añadir foto de portada</Text>
                </View>
              )}
              <View className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              {uploadState?.kind === "cover" ? (
                <View className="absolute inset-0 items-center justify-center bg-abyss/85">
                  <ActivityIndicator size="large" color={colors.lunar} />
                  <Text className="mt-3 text-xs font-bold text-white">Procesando portada ({uploadState.progress}%)</Text>
                </View>
              ) : null}
            </View>
          </Pressable>

          <View className="items-center px-6 pb-6 pt-2">
            <Pressable
              disabled={Boolean(uploadState)}
              onPress={() => void uploadProfileImage("avatar")}
              style={({ pressed }) => [
                {
                  marginTop: -52,
                  height: 100,
                  width: 100,
                  overflow: "hidden",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 50,
                  borderWidth: 4,
                  borderColor: colors.surface,
                  backgroundColor: colors.surface,
                  opacity: pressed ? 0.9 : 1,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 6,
                  elevation: 8,
                },
              ]}
            >
              {avatarUrl ? (
                <ExpoImage source={{ uri: avatarUrl }} style={{ width: "100%", height: "100%" }} className="h-full w-full" contentFit="cover" cachePolicy="none" transition={200} onError={(event) => console.warn("No se pudo renderizar el avatar:", event.error)} />
              ) : (
                <Text className="text-4xl font-extrabold" style={{ color: colors.background }}>{getInitials(profileName || displayName)}</Text>
              )}
              {uploadState?.kind === "avatar" ? (
                <View className="absolute inset-0 items-center justify-center rounded-full bg-abyss/85">
                  <ActivityIndicator color={colors.lunar} />
                  <Text className="mt-1 text-[11px] font-bold text-white">{uploadState.progress}%</Text>
                </View>
              ) : null}
            </Pressable>

            <View className="mt-3 w-full flex-row items-center justify-center gap-2">
              {isEditingName ? (
                <TextInput
                  value={nameDraft}
                  onChangeText={setNameDraft}
                  autoFocus
                  editable={!isSavingName}
                  maxLength={20}
                  returnKeyType="done"
                  onSubmitEditing={() => void handleSaveName()}
                  placeholder="Tu nombre"
                  placeholderTextColor={colors.muted}
                  className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-center text-base font-bold text-foreground"
                  style={{ maxWidth: 250, borderColor: colors.primary, backgroundColor: colors.background }}
                />
              ) : (
                <Text className="text-2xl font-black text-foreground tracking-tight" numberOfLines={1}>{profileName || displayName}</Text>
              )}
              {isEditingName ? (
                <View className="flex-row items-center gap-1.5">
                  <Pressable disabled={isSavingName} onPress={() => void handleSaveName()} hitSlop={8} style={({ pressed }) => ({ padding: 7, borderRadius: 10, backgroundColor: `${colors.success}20`, opacity: pressed ? 0.65 : 1 })}>
                    {isSavingName ? <ActivityIndicator size="small" color={colors.success} /> : <IconSymbol name="checkmark.circle.fill" size={20} color={colors.success} />}
                  </Pressable>
                  <Pressable disabled={isSavingName} onPress={handleCancelNameEdit} hitSlop={8} style={({ pressed }) => ({ padding: 7, borderRadius: 10, backgroundColor: `${colors.error}18`, opacity: pressed ? 0.65 : 1 })}>
                    <IconSymbol name="xmark.circle.fill" size={20} color={colors.error} />
                  </Pressable>
                </View>
              ) : (
                <Pressable onPress={handleStartNameEdit} hitSlop={10} accessibilityLabel="Editar nombre" style={({ pressed }) => ({ padding: 7, borderRadius: 10, backgroundColor: `${colors.primary}18`, opacity: pressed ? 0.65 : 1 })}>
                  <IconSymbol name="pencil" size={17} color={colors.primary} />
                </Pressable>
              )}
            </View>
            <Text className="mt-1 text-xs font-medium text-muted" numberOfLines={1}>{email}</Text>
            {isEditingBio ? (
              <View className="mt-3 w-full rounded-2xl border p-3" style={{ borderColor: colors.primary, backgroundColor: colors.background }}>
                <TextInput
                  value={bioDraft}
                  onChangeText={(value) => setBioDraft(value.slice(0, 280))}
                  editable={!isSavingBio}
                  autoFocus
                  multiline
                  maxLength={280}
                  placeholder="Escribe algo sobre ti o tu plan de hoy…"
                  placeholderTextColor={colors.muted}
                  className="min-h-[54px] text-center text-sm leading-5 text-foreground"
                />
                <View className="mt-2 flex-row items-center justify-between">
                  <Text className="text-[10px] text-muted">{bioDraft.length}/280</Text>
                  <View className="flex-row items-center gap-2">
                    <Pressable disabled={isSavingBio} onPress={handleCancelBioEdit} style={({ pressed }) => ({ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9, opacity: pressed ? 0.65 : 1 })}>
                      <Text className="text-xs font-semibold text-muted">Cancelar</Text>
                    </Pressable>
                    <Pressable disabled={isSavingBio} onPress={() => void handleSaveBio()} style={({ pressed }) => ({ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: colors.primary, opacity: pressed ? 0.75 : 1 })}>
                      {isSavingBio ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text className="text-xs font-bold text-white">Guardar</Text>}
                    </Pressable>
                  </View>
                </View>
              </View>
            ) : (
              <Pressable onPress={handleStartBioEdit} accessibilityLabel="Editar biografía" style={({ pressed }) => ({ marginTop: 10, maxWidth: 300, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: bio ? `${colors.primary}12` : `${colors.muted}12`, opacity: pressed ? 0.65 : 1 })}>
                <Text className="text-center text-xs leading-5" style={{ color: bio ? colors.foreground : colors.muted }}>{bio || "Añade una biografía o estado del día"}</Text>
                <IconSymbol name="pencil" size={13} color={colors.primary} />
              </Pressable>
            )}
            {isEditingName ? (
              <Text className="mt-2 text-center text-[11px] text-muted">El nombre debe tener entre 2 y 20 caracteres. Solo podrás cambiarlo una vez cada 7 días.</Text>
            ) : null}

            {uploadState ? (
              <View className="mt-4 w-full rounded-2xl border p-3.5 shadow-sm" style={{ backgroundColor: `${colors.midnight}`, borderColor: colors.border }}>
                <View className="flex-row items-center gap-2">
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text className="flex-1 text-xs font-semibold text-foreground">{uploadState.message}</Text>
                  <Text className="text-xs font-bold" style={{ color: colors.primary }}>{uploadState.progress}%</Text>
                </View>
                <View className="mt-2.5 h-2 overflow-hidden rounded-full" style={{ backgroundColor: colors.border }}>
                  <View className="h-full rounded-full" style={{ width: `${uploadState.progress}%`, backgroundColor: colors.primary }} />
                </View>
              </View>
            ) : uploadNotice ? (
              <View className="mt-4 w-full flex-row items-center justify-center gap-2 rounded-2xl border p-3.5" style={{ backgroundColor: `${colors.success}18`, borderColor: `${colors.success}66` }}>
                <IconSymbol name="checkmark.circle.fill" size={18} color={colors.success} />
                <Text className="text-xs font-semibold" style={{ color: colors.success }}>{uploadNotice}</Text>
              </View>
            ) : null}

            <Pressable
              onPress={() => router.push("/(tabs)/stories")}
              style={({ pressed }) => [
                {
                  marginTop: 16,
                  height: 46,
                  width: "100%",
                  maxWidth: 220,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 14,
                  backgroundColor: colors.primary,
                  opacity: pressed ? 0.85 : 1,
                  shadowColor: colors.primary,
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.25,
                  shadowRadius: 4,
                  elevation: 3,
                },
              ]}
            >
              <Text className="font-bold text-white">Gestionar Historias y Música</Text>
            </Pressable>
          </View>
        </View>

        {/* Tarjetas de estadísticas */}
        <View className="flex-row gap-3 mb-6">
          <View className="flex-1 p-4 rounded-2xl border items-center shadow-sm" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
            <Text className="text-3xl font-black text-primary mb-1">{checkinCount}</Text>
            <Text className="text-xs font-bold text-muted uppercase tracking-wider">Brindis</Text>
          </View>
          <View className="flex-1 p-4 rounded-2xl border items-center shadow-sm" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
            <Text className="text-3xl font-black text-warning mb-1">{visitedVenueCount}</Text>
            <Text className="text-xs font-bold text-muted uppercase tracking-wider">Bares</Text>
          </View>
        </View>

        {/* Historial reciente */}
        <View className="mb-6">
          <Text className="text-lg font-bold text-foreground mb-3">Últimos brindis</Text>
          {isLoadingData ? <ActivityIndicator className="my-4" color={colors.primary} /> : null}
          {!isLoadingData && recentCheckins.length === 0 ? (
            <View className="items-center rounded-2xl border p-6" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
              <IconSymbol name="cup.and.saucer.fill" size={28} color={colors.muted} />
              <Text className="mt-3 text-center font-semibold text-foreground">Todavía no tienes brindis</Text>
              <Text className="mt-1 text-center text-xs leading-5 text-muted">Cuando visites un bar, aparecerá en tu historial.</Text>
            </View>
          ) : null}
          {recentCheckins.map((item) => (
            <View key={item.id} className="flex-row items-center gap-3 p-3.5 rounded-2xl mb-2.5 border shadow-sm" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
              <View className="h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: `${colors.primary}18` }}>
                <IconSymbol name="cup.and.saucer.fill" size={20} color={colors.primary} />
              </View>
              <View className="flex-1">
                <Text className="font-bold text-foreground text-sm">Brindis en tu ubicación actual</Text>
                <Text className="text-[11px] text-muted">{new Date(item.createdAt).toLocaleString()}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Sección de configuración unificada y alineada */}
        <View className="mb-8">
          <Text className="text-lg font-bold text-foreground mb-3">Configuración de Privacidad y Cuenta</Text>

          <View className="overflow-hidden rounded-2xl border" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
            <View className="flex-row items-center justify-between p-4 border-b" style={{ borderColor: colors.border }}>
              <View className="flex-row items-center gap-3 flex-1 pr-3">
                <View className="h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: `${colors.primary}18` }}>
                  <IconSymbol name="bell.fill" size={18} color={colors.primary} />
                </View>
                <View className="flex-1">
                  <Text className="font-bold text-foreground">Notificaciones</Text>
                  <Text className="text-xs text-muted">Alertas de amigos y actividad</Text>
                </View>
              </View>
              <Switch value={notificationsEnabled} onValueChange={handleToggleNotifications} trackColor={{ false: colors.border, true: colors.success }} thumbColor={colors.background} />
            </View>

            <View className="flex-row items-center justify-between p-4 border-b" style={{ borderColor: colors.border }}>
              <View className="flex-row items-center gap-3 flex-1 pr-3">
                <View className="h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: `${colors.primary}18` }}>
                  <IconSymbol name="person.fill" size={18} color={colors.primary} />
                </View>
                <View className="flex-1">
                  <Text className="font-bold text-foreground">Perfil público</Text>
                  <Text className="text-xs text-muted">Visible para otros usuarios</Text>
                </View>
              </View>
              <Switch value={isPublicProfile} onValueChange={handleTogglePublicProfile} trackColor={{ false: colors.border, true: colors.success }} thumbColor={colors.background} />
            </View>

            <View className="flex-row items-center justify-between p-4 border-b" style={{ borderColor: colors.border }}>
              <View className="flex-row items-center gap-3 flex-1 pr-3">
                <View className="h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: `${colors.primary}18` }}>
                  <IconSymbol name="map.fill" size={18} color={colors.primary} />
                </View>
                <View className="flex-1">
                  <Text className="font-bold text-foreground">Aparecer cerca</Text>
                  <Text className="text-xs text-muted">Descubrimiento cercano activo</Text>
                </View>
              </View>
              <Switch value={discoverableNearby} onValueChange={handleToggleNearby} trackColor={{ false: colors.border, true: colors.success }} thumbColor={colors.background} />
            </View>

            <View className="flex-row items-center justify-between p-4">
              <View className="flex-row items-center gap-3 flex-1 pr-3">
                <View className="h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: `${colors.primary}18` }}>
                  <IconSymbol name="location.fill" size={18} color={colors.primary} />
                </View>
                <View className="flex-1">
                  <Text className="font-bold text-foreground">Compartir ubicación</Text>
                  <Text className="text-xs text-muted">Permitir que tus amigos te vean</Text>
                </View>
              </View>
              <Switch value={locationSharing} onValueChange={handleToggleLocation} trackColor={{ false: colors.border, true: colors.success }} thumbColor={colors.background} />
            </View>
          </View>
        </View>

        {/* Botón de cerrar sesión */}
        <Pressable
          onPress={handleLogout}
          style={({ pressed }) => ({
            alignSelf: "stretch",
            alignItems: "center",
            marginBottom: 32,
            minHeight: 52,
            paddingVertical: 14,
            paddingHorizontal: 16,
            borderRadius: 16,
            backgroundColor: `${colors.error}18`,
            borderColor: `${colors.error}66`,
            borderWidth: 1,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text className="text-center font-bold" style={{ color: colors.error }}>Cerrar sesión en este dispositivo</Text>
        </Pressable>
      </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
