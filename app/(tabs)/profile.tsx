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

type RecentCheckin = { id: number; venueName: string; createdAt: string };
type UploadKind = "avatar" | "cover";
type UploadState = { kind: UploadKind; progress: number; message: string };
type StorageReference = { bucket: string; path: string };

async function prepareProfileImage(uri: string, kind: UploadKind) {
  const maxWidth = kind === "avatar" ? 720 : 1600;
  return ImageManipulator.manipulateAsync(uri, [{ resize: { width: maxWidth } }], {
    format: ImageManipulator.SaveFormat.PNG,
  });
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
    return { bucket: remainder.slice(0, slashIndex), path: decodeURIComponent(remainder.slice(slashIndex + 1)) };
  } catch {
    return null;
  }
}

function getInitials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

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
      const rows = (data ?? []) as { id: number; created_at: string; venues: { name?: string | null } | null }[];
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
      const sourceUri =
        Platform.OS === "web" && asset.base64
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
        previousReference &&
        (previousReference.bucket === "profiles" || previousReference.bucket === "stories") &&
        previousReference.path.startsWith(safePreviousPrefix) &&
        previousReference.path !== path
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
    try {
      setIsSavingName(true);
      const { data, error } = await supabase
        .from("profiles")
        .update({ name: nextName })
        .eq("id", user.id)
        .select("name, last_name_changed_at")
        .maybeSingle();
      if (error) throw error;
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
      if (error) throw error;
      setBio(nextBio);
      setIsEditingBio(false);
    } catch (error) {
      Alert.alert("No se pudo guardar la biografía", error instanceof Error ? error.message : "Inténtalo de nuevo.");
    } finally {
      setIsSavingBio(false);
    }
  };

  const updatePrivacySetting = async (
    field: "is_public" | "discoverable_nearby" | "location_sharing",
    value: boolean,
  ) => {
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

  const handleLogout = () => {
    Alert.alert("Cerrar sesión", "¿Quieres cerrar la sesión de esta cuenta?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Cerrar sesión",
        style: "destructive",
        onPress: () => {
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

  const email = user?.email || "";

  return (
    <ScreenContainer className="px-5 pt-3">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 48 }}
          showsVerticalScrollIndicator={false}
        >
          <View
            className="mb-6 overflow-hidden rounded-3xl border shadow-lg"
            style={{ borderColor: `${colors.border}AA`, backgroundColor: colors.surface }}
          >
            <Pressable
              disabled={Boolean(uploadState)}
              onPress={() => void uploadProfileImage("cover")}
              accessibilityLabel="Cambiar foto de portada"
              style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
            >
              <View className="relative h-44 w-full bg-midnight">
                {coverUrl ? (
                  <ExpoImage
                    source={{ uri: coverUrl }}
                    style={{ width: "100%", height: "100%" }}
                    contentFit="cover"
                    cachePolicy="none"
                  />
                ) : (
                  <View className="h-full w-full items-center justify-center" style={{ backgroundColor: `${colors.primary}18` }}>
                    <IconSymbol name="photo.fill" size={28} color={colors.muted} />
                    <Text className="mt-2 text-xs font-bold uppercase tracking-wider text-muted">
                      Toca para añadir foto de portada
                    </Text>
                  </View>
                )}
              </View>
            </Pressable>

            <View className="items-center px-5 pb-5">
              <Pressable
                disabled={Boolean(uploadState)}
                onPress={() => void uploadProfileImage("avatar")}
                accessibilityLabel="Cambiar foto de perfil"
                style={{ marginTop: -40 }}
              >
                <View
                  className="h-24 w-24 items-center justify-center overflow-hidden rounded-full border-4"
                  style={{ borderColor: colors.surface, backgroundColor: colors.primary }}
                >
                  {avatarUrl ? (
                    <ExpoImage source={{ uri: avatarUrl }} style={{ width: "100%", height: "100%" }} contentFit="cover" cachePolicy="none" />
                  ) : (
                    <Text className="text-3xl font-bold" style={{ color: colors.background }}>
                      {getInitials(profileName || email)}
                    </Text>
                  )}
                </View>
              </Pressable>

              {isEditingName ? (
                <View className="mt-3 w-full flex-row items-center gap-2">
                  <TextInput
                    value={nameDraft}
                    onChangeText={setNameDraft}
                    maxLength={20}
                    className="flex-1 rounded-xl border px-3 py-2 text-center text-lg font-bold text-foreground"
                    style={{ borderColor: colors.border, backgroundColor: colors.background }}
                    placeholder="Tu nombre"
                    placeholderTextColor={colors.muted}
                    autoFocus
                  />
                  <Pressable onPress={() => void handleSaveName()} disabled={isSavingName}>
                    <Text style={{ color: colors.primary, fontWeight: "700" }}>{isSavingName ? "…" : "OK"}</Text>
                  </Pressable>
                  <Pressable onPress={handleCancelNameEdit}>
                    <Text style={{ color: colors.muted }}>✕</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable onPress={handleStartNameEdit} className="mt-3 flex-row items-center gap-2">
                  <Text className="text-2xl font-bold text-foreground">{profileName || email || "Tu perfil"}</Text>
                  <IconSymbol name="pencil" size={16} color={colors.muted} />
                </Pressable>
              )}

              {uploadNotice ? <Text className="mt-2 text-xs" style={{ color: colors.success }}>{uploadNotice}</Text> : null}
              {uploadState ? (
                <Text className="mt-2 text-xs text-muted">{uploadState.message} ({uploadState.progress}%)</Text>
              ) : null}

              {isEditingBio ? (
                <View className="mt-3 w-full">
                  <TextInput
                    value={bioDraft}
                    onChangeText={setBioDraft}
                    maxLength={280}
                    multiline
                    className="rounded-xl border px-3 py-2 text-sm text-foreground"
                    style={{ borderColor: colors.border, backgroundColor: colors.background, minHeight: 72 }}
                    placeholder="Cuéntale a la gente quién eres…"
                    placeholderTextColor={colors.muted}
                  />
                  <View className="mt-2 flex-row justify-end gap-2">
                    <Pressable onPress={() => void handleSaveBio()} className="rounded-lg px-3 py-2" style={{ backgroundColor: colors.primary }}>
                      <Text style={{ color: colors.background, fontWeight: "700" }}>{isSavingBio ? "…" : "Guardar"}</Text>
                    </Pressable>
                    <Pressable onPress={handleCancelBioEdit} className="rounded-lg border px-3 py-2" style={{ borderColor: colors.border }}>
                      <Text style={{ color: colors.muted }}>Cancelar</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable onPress={handleStartBioEdit} className="mt-3">
                  <Text className="text-center text-sm text-muted">{bio || "Añade una biografía"}</Text>
                </Pressable>
              )}

              <Text className="mt-1 text-sm text-muted">{email}</Text>
            </View>
          </View>

          <View className="mb-4 rounded-2xl border p-4" style={{ borderColor: colors.border, backgroundColor: colors.surface }}>
            <Text className="mb-3 text-base font-bold text-foreground">Privacidad</Text>
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="flex-1 text-sm text-foreground">Perfil público</Text>
              <Switch value={isPublicProfile} onValueChange={() => void updatePrivacySetting("is_public", !isPublicProfile)} />
            </View>
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="flex-1 text-sm text-foreground">Visible cerca</Text>
              <Switch value={discoverableNearby} onValueChange={() => void updatePrivacySetting("discoverable_nearby", !discoverableNearby)} />
            </View>
            <View className="flex-row items-center justify-between">
              <Text className="flex-1 text-sm text-foreground">Compartir ubicación</Text>
              <Switch value={locationSharing} onValueChange={() => void updatePrivacySetting("location_sharing", !locationSharing)} />
            </View>
          </View>

          <View className="mb-4 rounded-2xl border p-4" style={{ borderColor: colors.border, backgroundColor: colors.surface }}>
            <Text className="mb-2 text-base font-bold text-foreground">Actividad</Text>
            {isLoadingData ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                <Text className="text-sm text-muted">Check-ins: {checkinCount}</Text>
                <Text className="text-sm text-muted">Locales visitados: {visitedVenueCount}</Text>
                {recentCheckins.map((item) => (
                  <Text key={item.id} className="mt-1 text-xs text-muted">
                    {item.venueName}
                  </Text>
                ))}
              </>
            )}
          </View>

          <Pressable
            onPress={handleLogout}
            className="mb-6 items-center rounded-2xl border py-3"
            style={{ borderColor: "#ef4444" }}
          >
            <Text style={{ color: "#ef4444", fontWeight: "700" }}>Cerrar sesión</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
