import * as LegacyFileSystem from "expo-file-system/legacy";

function safeFileName(remoteUrl: string) {
  let hash = 0;
  for (let i = 0; i < remoteUrl.length; i += 1) {
    hash = (hash * 31 + remoteUrl.charCodeAt(i)) >>> 0;
  }
  const extMatch = remoteUrl.split("?")[0].match(/\.(mp4|mov|webm|m4v)$/i);
  const ext = extMatch ? extMatch[1].toLowerCase() : "mp4";
  return `v_${hash.toString(16)}.${ext}`;
}

/**
 * Devuelve URI local si el video ya está en caché; si no, dispara descarga
 * en segundo plano y reproduce desde la URL remota.
 */
export async function resolveCachedVideoUri(remoteUrl: string): Promise<string> {
  if (!remoteUrl || remoteUrl.startsWith("file://")) return remoteUrl;
  const base = LegacyFileSystem.cacheDirectory;
  if (!base) return remoteUrl;

  const dir = `${base}video-cache/`;
  try {
    await LegacyFileSystem.makeDirectoryAsync(dir, { intermediates: true });
  } catch {
    // ya existe
  }

  const local = `${dir}${safeFileName(remoteUrl)}`;
  try {
    const info = await LegacyFileSystem.getInfoAsync(local);
    if (info.exists && (info.size ?? 0) > 0) return local;
  } catch {
    // seguir con remoto
  }

  void LegacyFileSystem.downloadAsync(remoteUrl, local).catch(() => {
    // silencioso: sin red o disco lleno
  });

  return remoteUrl;
}
