import { File } from "expo-file-system";
import * as LegacyFileSystem from "expo-file-system/legacy";
import { fetch as expoFetch } from "expo/fetch";
import { Platform } from "react-native";
import * as ImageManipulator from "expo-image-manipulator";
import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase";
import { getCachedSignedUrl } from "@/lib/signed-url-cache";

export type VerifiedMediaKind = "image" | "video";
export const STORAGE_CACHE_CONTROL = "31536000";
export type ImageUploadKind = "avatar" | "cover" | "story" | "collage" | "feed" | "generic";

const IMAGE_LIMITS: Record<ImageUploadKind, { maxWidth: number; quality: number }> = {
  avatar: { maxWidth: 160, quality: 0.75 },
  cover: { maxWidth: 1080, quality: 0.78 },
  story: { maxWidth: 1080, quality: 0.78 },
  collage: { maxWidth: 1080, quality: 0.78 },
  feed: { maxWidth: 1080, quality: 0.78 },
  generic: { maxWidth: 1080, quality: 0.78 },
};

const inFlightDownloads = new Map<string, Promise<string | null>>();

export async function compressImageForUpload(uri: string, kind: ImageUploadKind = "generic"): Promise<{ uri: string; mimeType: "image/jpeg" }> {
  const { maxWidth, quality } = IMAGE_LIMITS[kind];
  const result = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: maxWidth } }], {
    compress: quality,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return { uri: result.uri, mimeType: "image/jpeg" };
}

function publicStorageUrl(bucket: string, path: string) {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  const url = data?.publicUrl;
  if (!url) throw new Error("Supabase no devolvió una URL pública para el archivo.");
  return url;
}

export async function verifyPublicStorageUrl(bucket: string, path: string, kind: VerifiedMediaKind) {
  const url = publicStorageUrl(bucket, path);
  let lastError = "";
  try {
    const response = await fetch(url, { method: "HEAD" });
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    const acceptableType = contentType === "" || contentType === "application/octet-stream" || contentType.startsWith("image/") || contentType.startsWith("video/") || contentType.startsWith(`${kind}/`);
    if (response.ok && acceptableType) return url;
    lastError = `HTTP ${response.status}${contentType ? ` (${contentType})` : ""}`;
  } catch (error) {
    lastError = error instanceof Error ? error.message : "error de red";
  }
  const signedUrl = await getCachedSignedUrl(bucket, path, 60 * 60 * 24);
  if (signedUrl) return signedUrl;
  throw new Error(`El archivo se subió, pero no se puede descargar desde Storage (${lastError || "sin respuesta"}). En Supabase → Storage → bucket "${bucket}": revisa sus permisos.`);
}

async function uploadWithExpoFetch(bucket: string, path: string, uri: string, mimeType: string, accessToken: string) {
  const file = new File(uri);
  if (!file.exists || !file.size) throw new Error("El archivo seleccionado no está disponible en el dispositivo.");
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const uploadUrl = `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`;
  const response = await expoFetch(uploadUrl, { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, apikey: SUPABASE_ANON_KEY, "Content-Type": mimeType, "Cache-Control": STORAGE_CACHE_CONTROL, "x-upsert": "false" }, body: file });
  const body = await response.text();
  if (!response.ok) {
    let detail = "";
    try { const parsed = JSON.parse(body || "{}"); detail = parsed.message || parsed.error || parsed.statusCode || ""; } catch { detail = body.slice(0, 180); }
    throw new Error(`Storage rechazó el archivo (${response.status})${detail ? `: ${detail}` : ". Revisa los permisos del bucket."}`);
  }
  if (!body) throw new Error("Storage aceptó la subida, pero no devolvió confirmación del archivo.");
  return body;
}

export async function uploadUriToStorage(bucket: string, path: string, uri: string, mimeType: string) {
  if (Platform.OS === "web") {
    const response = await fetch(uri);
    if (!response.ok) throw new Error("No se pudo leer el archivo seleccionado.");
    const blob = await response.blob();
    const result = await supabase.storage.from(bucket).upload(path, blob, { contentType: mimeType, cacheControl: STORAGE_CACHE_CONTROL, upsert: false });
    if (result.error) throw result.error;
    return result;
  }
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("Tu sesión expiró. Inicia sesión nuevamente.");
  try {
    return await uploadWithExpoFetch(bucket, path, uri, mimeType, accessToken);
  } catch (error) {
    if (!uri.startsWith("content://")) throw error;
    const cacheUri = `${LegacyFileSystem.cacheDirectory}upload_${Date.now()}.${mimeType.split("/")[1] || "bin"}`;
    await LegacyFileSystem.copyAsync({ from: uri, to: cacheUri });
    try { return await uploadWithExpoFetch(bucket, path, cacheUri, mimeType, accessToken); }
    finally { await LegacyFileSystem.deleteAsync(cacheUri, { idempotent: true }); }
  }
}

function cachedMediaName(bucket: string, path: string) {
  return `${bucket}:${path}`;
}

async function resolveCachedPrivateMedia(bucket: "chat-audio" | "chat-media", mediaPath: string, prefix: string) {
  if (!mediaPath) return null;
  const cacheDir = LegacyFileSystem.cacheDirectory;
  if (!cacheDir) return null;
  const safeName = mediaPath.replace(/[^a-zA-Z0-9._-]/g, "_");
  const localUri = `${cacheDir}${prefix}_${safeName}`;
  try {
    const info = await LegacyFileSystem.getInfoAsync(localUri);
    if (info.exists && "size" in info && (info.size ?? 0) > 0) return localUri;
  } catch {
    // Download below.
  }
  const key = cachedMediaName(bucket, mediaPath);
  const existing = inFlightDownloads.get(key);
  if (existing) return existing;
  const request = (async () => {
    const signedUrl = await getCachedSignedUrl(bucket, mediaPath, 60 * 60 * 6);
    if (!signedUrl) return null;
    try {
      const result = await LegacyFileSystem.downloadAsync(signedUrl, localUri);
      if (result.status >= 200 && result.status < 300) return result.uri;
    } catch {
      // Offline or storage unavailable. The caller can show an unavailable state.
    }
    return signedUrl;
  })().finally(() => inFlightDownloads.delete(key));
  inFlightDownloads.set(key, request);
  return request;
}

export function resolveCachedChatAudio(audioPath: string) {
  return resolveCachedPrivateMedia("chat-audio", audioPath, "chat-audio");
}

export function resolveCachedChatMedia(mediaPath: string, bucket: "chat-media" | "chat-audio" = "chat-media") {
  return resolveCachedPrivateMedia(bucket, mediaPath, bucket);
}
