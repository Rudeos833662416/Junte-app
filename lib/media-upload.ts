import { File } from "expo-file-system";
import * as LegacyFileSystem from "expo-file-system/legacy";
import { fetch as expoFetch } from "expo/fetch";
import { Platform } from "react-native";
import * as ImageManipulator from "expo-image-manipulator";
import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase";

export type VerifiedMediaKind = "image" | "video";

/** 1 year — stable public URLs can be cached aggressively by CDN and clients. */
export const STORAGE_CACHE_CONTROL = "31536000";

export type ImageUploadKind = "avatar" | "cover" | "story" | "collage" | "feed" | "generic";

const IMAGE_LIMITS: Record<ImageUploadKind, { maxWidth: number; quality: number }> = {
  avatar: { maxWidth: 320, quality: 0.75 },
  cover: { maxWidth: 1080, quality: 0.78 },
  story: { maxWidth: 1080, quality: 0.78 },
  collage: { maxWidth: 1080, quality: 0.78 },
  feed: { maxWidth: 1080, quality: 0.78 },
  generic: { maxWidth: 1080, quality: 0.78 },
};

/**
 * Resize + JPEG-compress before upload to cut Storage egress/ingress.
 * Returns a local file URI and the MIME type to use on upload.
 */
export async function compressImageForUpload(
  uri: string,
  kind: ImageUploadKind = "generic",
): Promise<{ uri: string; mimeType: "image/jpeg" }> {
  const { maxWidth, quality } = IMAGE_LIMITS[kind];
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: maxWidth } }],
    {
      compress: quality,
      format: ImageManipulator.SaveFormat.JPEG,
    },
  );
  return { uri: result.uri, mimeType: "image/jpeg" };
}

function publicStorageUrl(bucket: string, path: string) {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  const url = data?.publicUrl;
  if (!url) throw new Error("Supabase no devolvió una URL pública para el archivo.");
  return url;
}

export async function verifyPublicStorageUrl(
  bucket: string,
  path: string,
  kind: VerifiedMediaKind,
) {
  const url = publicStorageUrl(bucket, path);
  let lastError = "";

  for (const waitMs of [0, 350, 900, 1600]) {
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
    try {
      const response = await fetch(`${url}?verify=${Date.now()}`, {
        method: "GET",
        cache: "no-store",
      });
      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (contentType.includes("application/json")) {
        lastError = `HTTP ${response.status} (application/json)`;
        continue;
      }
      const acceptableType =
        contentType === "" ||
        contentType === "application/octet-stream" ||
        contentType.startsWith("image/") ||
        contentType.startsWith("video/") ||
        contentType.startsWith(`${kind}/`);
      if (response.ok && acceptableType) return url;
      lastError = `HTTP ${response.status}${contentType ? ` (${contentType})` : ""}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "error de red";
    }
  }

  try {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24);
    if (!error && data?.signedUrl) return data.signedUrl;
    if (error) lastError = error.message || lastError;
  } catch (error) {
    lastError = error instanceof Error ? error.message : lastError;
  }

  throw new Error(
    `El archivo se subió, pero no se puede descargar desde Storage (${lastError || "sin respuesta"}). ` +
      `En Supabase → Storage → bucket "${bucket}": actívalo como público o añade policy SELECT pública / para authenticated.`,
  );
}

async function uploadWithExpoFetch(
  bucket: string,
  path: string,
  uri: string,
  mimeType: string,
  accessToken: string,
) {
  const file = new File(uri);
  if (!file.exists || !file.size) {
    throw new Error("El archivo seleccionado no está disponible en el dispositivo.");
  }

  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const uploadUrl = `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`;
  const response = await expoFetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: SUPABASE_ANON_KEY,
      "Content-Type": mimeType,
      "Cache-Control": STORAGE_CACHE_CONTROL,
      "x-upsert": "false",
    },
    body: file,
  });
  const body = await response.text();

  if (!response.ok) {
    let detail = "";
    try {
      const parsed = JSON.parse(body || "{}");
      detail = parsed.message || parsed.error || parsed.statusCode || "";
    } catch {
      detail = body.slice(0, 180);
    }
    throw new Error(`Storage rechazó el archivo (${response.status})${detail ? `: ${detail}` : ". Revisa los permisos del bucket."}`);
  }
  if (!body) throw new Error("Storage aceptó la subida, pero no devolvió confirmación del archivo.");
  return body;
}

export async function uploadUriToStorage(
  bucket: string,
  path: string,
  uri: string,
  mimeType: string,
) {
  if (Platform.OS === "web") {
    const response = await fetch(uri);
    if (!response.ok) throw new Error("No se pudo leer el archivo seleccionado.");
    const blob = await response.blob();
    const result = await supabase.storage.from(bucket).upload(path, blob, {
      contentType: mimeType,
      cacheControl: STORAGE_CACHE_CONTROL,
      upsert: false,
    });
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
    try {
      return await uploadWithExpoFetch(bucket, path, cacheUri, mimeType, accessToken);
    } finally {
      await LegacyFileSystem.deleteAsync(cacheUri, { idempotent: true });
    }
  }
}

/**
 * Download a private chat-audio object once into the device cache and reuse the local file.
 * Avoids re-signing + re-downloading the same voice note on every play / re-open.
 */
export async function resolveCachedChatAudio(audioPath: string): Promise<string | null> {
  if (!audioPath) return null;
  const safeName = audioPath.replace(/[^a-zA-Z0-9._-]/g, "_");
  const cacheDir = LegacyFileSystem.cacheDirectory;
  if (!cacheDir) return null;
  const localUri = `${cacheDir}chat-audio_${safeName}`;

  try {
    const info = await LegacyFileSystem.getInfoAsync(localUri);
    if (info.exists && "size" in info && (info.size ?? 0) > 0) {
      return localUri;
    }
  } catch {
    /* continue to download */
  }

  const { data, error } = await supabase.storage.from("chat-audio").createSignedUrl(audioPath, 60 * 60 * 6);
  if (error || !data?.signedUrl) return null;

  try {
    const result = await LegacyFileSystem.downloadAsync(data.signedUrl, localUri);
    if (result.status >= 200 && result.status < 300) return result.uri;
  } catch {
    /* fall through */
  }

  // Fallback: play from signed URL without caching
  return data.signedUrl;
}
