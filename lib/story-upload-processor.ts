import { Platform } from "react-native";
import { compressImageForUpload, uploadUriToStorage, verifyPublicStorageUrl } from "@/lib/media-upload";
import { supabase } from "@/lib/supabase";
import type { StoryUploadJob } from "@/lib/story-upload-queue";

/** WhatsApp-style story video limits (within Supabase Storage Free 50 MB). */
export const MAX_STORY_VIDEO_BYTES = 45_000_000; // 45 MB
export const MAX_COMPRESSED_VIDEO_BYTES = 45_000_000;
export const MAX_STORY_DURATION_SECONDS = 90;

async function prepareStoryImage(uri: string) {
  return compressImageForUpload(uri, "story");
}

async function prepareStoryVideo(
  uri: string,
  onProgress: (progress: number) => void,
  trimStartSec?: number,
  trimEndSec?: number | null,
) {
  if (Platform.OS === "web") return uri;
  const { compress, getMetadata } = await import("expo-image-and-video-compressor");
  const sourceMetadata = await getMetadata(uri);

  const start = Math.max(0, trimStartSec ?? 0);
  const end =
    trimEndSec != null && Number.isFinite(trimEndSec)
      ? Math.max(start + 1, trimEndSec)
      : Math.min(sourceMetadata.duration || MAX_STORY_DURATION_SECONDS, MAX_STORY_DURATION_SECONDS);
  const segmentSec = Math.max(1, end - start);

  if (segmentSec > MAX_STORY_DURATION_SECONDS + 0.5) {
    throw new Error("El fragmento seleccionado no puede superar 90 segundos.");
  }

  const fullDuration = Math.max(sourceMetadata.duration || segmentSec, segmentSec);
  const estimatedSegmentBytes =
    sourceMetadata.size > 0 ? (sourceMetadata.size * segmentSec) / fullDuration : sourceMetadata.size;
  if (estimatedSegmentBytes > MAX_STORY_VIDEO_BYTES) {
    throw new Error("El fragmento supera ~45 MB. Acorta el recorte o elige un video más ligero.");
  }

  onProgress(0.1);
  const compressedUri = await compress(
    uri,
    {
      bitrate: 1_800_000,
      maxSize: 720,
      codec: "h264",
      speed: "fast",
      minimumFileSizeForCompress: 2_000_000,
      progressDivider: 5,
    },
    (progress) => onProgress(0.1 + progress * 0.65),
  );
  const compressedMetadata = await getMetadata(compressedUri);
  const compressedEstimate =
    compressedMetadata.size > 0
      ? (compressedMetadata.size * segmentSec) / Math.max(compressedMetadata.duration || segmentSec, segmentSec)
      : compressedMetadata.size;
  if (compressedEstimate > MAX_COMPRESSED_VIDEO_BYTES) {
    throw new Error("Tras comprimir, el fragmento sigue por encima de 45 MB. Acorta el recorte.");
  }
  onProgress(0.82);
  return compressedUri;
}

export async function processStoryUpload(job: StoryUploadJob, onProgress: (progress: number) => void) {
  const session = await supabase.auth.getSession();
  if (session.error) throw session.error;
  if (session.data.session?.user.id !== job.userId) throw new Error("Tu sesión cambió. Reintenta este estado.");

  let finalUri = job.uri;
  let mimeType = job.type === "video" ? "video/mp4" : "image/jpeg";
  let ext = job.type === "video" ? "mp4" : "jpg";

  if (job.type === "image") {
    const prepared = await prepareStoryImage(job.uri);
    finalUri = prepared.uri;
    mimeType = prepared.mimeType;
    ext = "jpg";
  } else {
    finalUri = await prepareStoryVideo(job.uri, onProgress, job.trimStart, job.trimEnd);
  }

  onProgress(0.85);
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
    trim_start_sec: job.type === "video" ? Math.max(0, job.trimStart ?? 0) : 0,
    trim_end_sec: job.type === "video" && job.trimEnd != null ? Math.max(job.trimStart ?? 0, job.trimEnd) : null,
    is_muted: job.type === "video" ? Boolean(job.isMuted) : false,
    text_content: job.overlayText?.trim() || null,
    expires_at: expiresAt,
  });
  if (error) throw error;
}
