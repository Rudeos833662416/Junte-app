import { useCallback, useState } from "react";
import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import {
  compressImageForUpload,
  resolveCachedChatMedia,
  uploadUriToStorage,
} from "@/lib/media-upload";
import { supabase } from "@/lib/supabase";

export const MAX_CHAT_VIDEO_BYTES = 45_000_000;

export type PendingChatMedia = {
  uri: string;
  kind: "image" | "video";
  mimeType: string;
  fileSize?: number;
  durationMs?: number;
};

export type ChatMediaMessageFields = {
  kind: "image" | "video";
  media_path: string;
  media_type: string;
  body: string;
  duration_ms: number | null;
};

export function useChatMedia() {
  const [pending, setPending] = useState<PendingChatMedia | null>(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);

  const clearPending = useCallback(() => {
    setPending(null);
    setCaption("");
  }, []);

  const pickMedia = useCallback(async (source: "library" | "camera") => {
    try {
      if (source === "camera") {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert("Permiso requerido", "Necesitamos acceso a la cámara.");
          return;
        }
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ["images", "videos"],
          quality: 0.85,
          videoMaxDuration: 90,
        });
        if (result.canceled || !result.assets[0]) return;
        const asset = result.assets[0];
        const isVideo = (asset.type === "video") || (asset.mimeType?.startsWith("video/") ?? false);
        if (isVideo && (asset.fileSize ?? 0) > MAX_CHAT_VIDEO_BYTES) {
          Alert.alert("Vídeo demasiado pesado", "Máximo 45 MB. Graba un clip más corto.");
          return;
        }
        setPending({
          uri: asset.uri,
          kind: isVideo ? "video" : "image",
          mimeType: asset.mimeType ?? (isVideo ? "video/mp4" : "image/jpeg"),
          fileSize: asset.fileSize,
          durationMs: asset.duration ?? undefined,
        });
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        quality: 0.85,
        videoMaxDuration: 90,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const isVideo = (asset.type === "video") || (asset.mimeType?.startsWith("video/") ?? false);
      if (isVideo && (asset.fileSize ?? 0) > MAX_CHAT_VIDEO_BYTES) {
        Alert.alert("Vídeo demasiado pesado", "Máximo 45 MB. Elige un clip más corto.");
        return;
      }
      setPending({
        uri: asset.uri,
        kind: isVideo ? "video" : "image",
        mimeType: asset.mimeType ?? (isVideo ? "video/mp4" : "image/jpeg"),
        fileSize: asset.fileSize,
        durationMs: asset.duration ?? undefined,
      });
    } catch {
      Alert.alert("Error", "No se pudo seleccionar el archivo.");
    }
  }, []);

  const uploadAndBuildFields = useCallback(
    async (
      senderId: string,
      recipientId: string,
      clientMessageId: string,
    ): Promise<ChatMediaMessageFields | null> => {
      if (!pending || uploading) return null;
      setUploading(true);
      try {
        let uploadUri = pending.uri;
        let mimeType = pending.mimeType;
        let ext = pending.kind === "video" ? "mp4" : "jpg";

        if (pending.kind === "image") {
          const prepared = await compressImageForUpload(pending.uri, "feed");
          uploadUri = prepared.uri;
          mimeType = prepared.mimeType;
          ext = "jpg";
        } else if ((pending.fileSize ?? 0) > MAX_CHAT_VIDEO_BYTES) {
          Alert.alert("Vídeo demasiado pesado", "Máximo 45 MB.");
          return null;
        }

        const mediaPath = `${senderId}/${recipientId}/${clientMessageId}.${ext}`;
        await uploadUriToStorage("chat-media", mediaPath, uploadUri, mimeType);
        return {
          kind: pending.kind,
          media_path: mediaPath,
          media_type: mimeType,
          body: caption.trim(),
          duration_ms: pending.kind === "video" ? (pending.durationMs ?? null) : null,
        };
      } finally {
        setUploading(false);
      }
    },
    [pending, caption, uploading],
  );

  return {
    pending,
    caption,
    setCaption,
    uploading,
    pickMedia,
    clearPending,
    uploadAndBuildFields,
    resolveMediaUrl: resolveCachedChatMedia,
  };
}
