import { File } from "expo-file-system";
import * as LegacyFileSystem from "expo-file-system/legacy";
import { fetch as expoFetch } from "expo/fetch";
import { Platform } from "react-native";
import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase";

export type VerifiedMediaKind = "image" | "video";

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

  for (const waitMs of [0, 350, 900, 1800]) {
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
    try {
      const response = await fetch(`${url}?verify=${Date.now()}`, {
        method: "GET",
        cache: "no-store",
        headers: { Accept: kind === "image" ? "image/*" : "video/*" },
      });
      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      const acceptableType = contentType === "" || contentType === "application/octet-stream" || contentType.startsWith(`${kind}/`);
      if (response.ok && acceptableType) return url;
      lastError = `HTTP ${response.status}${contentType ? ` (${contentType})` : ""}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "error de red";
    }
  }

  throw new Error(`El archivo se subió, pero no se puede descargar desde Storage (${lastError || "sin respuesta"}). Verifica que el bucket ${bucket} sea público.`);
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
      "Cache-Control": "3600",
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
      cacheControl: "3600",
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
    // Algunos selectores Android entregan content://; se copia a cache como file:// y se reintenta.
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
