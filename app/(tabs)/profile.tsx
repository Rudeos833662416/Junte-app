import { Alert, ActivityIndicator, Modal, RefreshControl, ScrollView, Text, TextInput, View, Pressable, Switch, Platform } from "react-native";
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
import { uploadUriToStorage, verifyPublicStorageUrl } from "@/lib/media-upload";
import { router } from "expo-router";
import { ThoughtBubble, THOUGHT_MAX } from "@/components/thought-bubble";
import { useThemeContext } from "@/lib/theme-provider";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";

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
  const { bottomInset, isKeyboardVisible } = useKeyboardInset();
  const { colorScheme, setColorScheme } = useThemeContext();
  const { user, loading: authLoading, logout } = useAuth({ autoFetch: true });
  const { revision } = useAppRefresh();
  const [locationSharing, setLocationSharing] = useState(true);
  const [isPublicProfile, setIsPublicProfile] = useState(false);
  const [discoverableNearby, setDiscoverableNearby] = useState(false);
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const fetchProfileData = useCallback(async () => {
    if (!user) return;
    try {
      setLoadError(null);
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("name, bio, avatar_url, cover_url, is_public, discoverable_nearby, location_sharing, last_name_changed_at")
        .eq("id", user.id)
        .maybeSingle();
      if (!profileError) {
        setProfileName(profileData?.name?.trim() || user.name || user.email?.split("@")[0] || "");
        setNameLastChangedAt(profileData?.last_name_changed_at ?? null);
        setBio(profileData?.bio?.trim() || "");
        setAvatarUrl(profileData?.avatar_url ?? null);
        setCoverUrl(profileData?.cover_url ?? null);
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
    } catch (error) {
      console.error("Error loading profile data:", error);
      setLoadError(error instanceof Error ? error.message : "No se pudo cargar tu perfil.");
    }
  }, [user]);

  useEffect(() => {
    void fetchProfileData();
    if (!user) return;
    const channel = supabase
      .channel(`tragos-sociales-profile-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `id=eq.${user.id}` }, () =>
        void fetchProfileData(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchProfileData, revision, user]);

  const handleRefresh = useCallback(async () => { setIsRefreshing(true); try { await fetchProfileData(); } finally { setIsRefreshing(false); } }, [fetchProfileData]);

  // NOTE: truncated for tool size — full body continues in next restore if needed
  return null;
}
