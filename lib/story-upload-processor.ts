import * as ImageManipulator from "expo-image-manipulator";
import { Platform } from "react-native";
import { uploadUriToStorage, verifyPublicStorageUrl } from "@/lib/media-upload";
import { supabase } from "@/lib/supabase";
import type { StoryUploadJob } from "@/lib/story-upload-queue";

export const MAX_STORY_VIDEO_BYTES = 300_000_000;
export const MAX_COMPRESSED_VIDEO_BYTES = 100_000_000;
export const MAX_STORY_DURATION_SECONDS = 300;

async function prepareStoryImage(uri: string) {
  return ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1440 } }],
    { format: ImageManipulator.SaveFormat.PNG },
  );
}

async function prepareStoryVideo(uri: string, onProgress: (progress: number) => void) {
  if (Platform.OS === "web") return uri;
  const { compress, getMetadata } = await import("expo-image-and-video-compressor");
  const sourceMetadata = await getMetadata(uri);
  if (sourceMetadata.duration > MAX_STORY_DURATION_SECONDS) {
    throw new Error("Las historias en vídeo pueden durar como máximo 5 minutos (300 segundos).");
  }
  if (sourceMetadata.size > MAX_STORY_VIDEO_BYTES) {
    throw new Error("El vídeo supera el límite de 300 MB.");
  }
  onProgress(0.1);
  const compressedUri = await compress(uri, {
    bitrate: 2_500_000,
    maxSize: 720,
    codec: "h264",
    speed: "fast",
    minimumFileSizeForCompress: 2_000_000,
    progressDivider: 5,
  }, (progress) => onProgress(0.1 + progress * 0.65));
  const compressedMetadata = await getMetadata(compressedUri);
  if (compressedMetadata.duration > MAX_STORY_DURATION_SECONDS || compressedMetadata.size > MAX_COMPRESSED_VIDEO_BYTES) {
    throw new Error("El vídeo no pudo quedar dentro de 5 minutos y 100 MB comprimidos.");
  }
  onProgress(0.82);
  return compressedUri;
}

export async function processStoryUpload(job: StoryUploadJob, onProgress: (progress: number) => void) {
  const session = await supabase.auth.getSession();
  if (session.error) throw session.error;
  if (session.data.session?.user.id !== job.userId) throw new Error("Tu sesión cambió. Reintenta este estado.");

  let finalUri = job.uri;
  if (job.type === "image") {
    const prepared = await prepareStoryImage(job.uri);
    finalUri = prepared.uri;
  } else {
    finalUri = await prepareStoryVideo(job.uri, onProgress);
  }

  onProgress(0.85);
  const ext = job.type === "video" ? "mp4" : "png";
  const mimeType = job.type === "video" ? "video/mp4" : "image/png";
  const path = `${job.userId}/${job.id}.${ext}`;
  await uploadUriToStorage("stories", path, finalUri, mimeType);
  const mediaUrl = await verifyPublicStorageUrl("stories", path, job.type);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.from("stories").insert({
    user_id: job.userId,
    media_url: mediaUrl,
    media_type: job.type,
    caption: job.caption.trim() || null,
    visibility: job.privacy === "public" ? "public" : "friends",
    privacy: job.privacy,
    expires_at: expiresAt,
  });
  if (error) throw error;
}
