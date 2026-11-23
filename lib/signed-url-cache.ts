import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "junta2:signed-url-cache:v1";
const FRESHNESS_RATIO = 0.8;

type SignedUrlEntry = {
  signedUrl: string;
  createdAt: number;
  expiresAt: number;
};

type PersistedCache = Record<string, SignedUrlEntry>;

const memoryCache = new Map<string, SignedUrlEntry>();
const inFlight = new Map<string, Promise<string | null>>();
let storageLoaded: Promise<void> | null = null;

async function getSupabaseClient() {
  const module = await import("@/lib/supabase");
  return module.supabase;
}

export function getSignedUrlCacheKey(bucket: string, path: string) {
  return `${bucket}:${path}`;
}

export function isSignedUrlReusable(entry: SignedUrlEntry, now = Date.now()) {
  if (!entry.signedUrl || entry.expiresAt <= now) return false;
  const lifetime = entry.expiresAt - entry.createdAt;
  return lifetime > 0 && now < entry.createdAt + lifetime * FRESHNESS_RATIO;
}

async function loadStorage() {
  if (!storageLoaded) {
    storageLoaded = AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw) as PersistedCache;
          for (const [key, entry] of Object.entries(parsed)) {
            if (isSignedUrlReusable(entry)) memoryCache.set(key, entry);
          }
        } catch {
          // Corrupted cache is disposable; the next successful request rebuilds it.
        }
      })
      .catch(() => undefined);
  }
  await storageLoaded;
}

async function persistStorage() {
  const serializable: PersistedCache = {};
  for (const [key, entry] of memoryCache) {
    if (isSignedUrlReusable(entry)) serializable[key] = entry;
  }
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
  } catch {
    // Disk persistence is best effort; memory cache remains usable.
  }
}

export async function getCachedSignedUrl(bucket: string, path: string, expiresInSeconds: number) {
  await loadStorage();
  const key = getSignedUrlCacheKey(bucket, path);
  const existing = memoryCache.get(key);
  if (existing && isSignedUrlReusable(existing)) return existing.signedUrl;
  memoryCache.delete(key);
  const request = inFlight.get(key);
  if (request) return request;
  const promise = (async () => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
    if (error || !data?.signedUrl) return null;
    const now = Date.now();
    memoryCache.set(key, {
      signedUrl: data.signedUrl,
      createdAt: now,
      expiresAt: now + expiresInSeconds * 1000,
    });
    await persistStorage();
    return data.signedUrl;
  })().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}

export async function clearSignedUrlCache() {
  memoryCache.clear();
  inFlight.clear();
  storageLoaded = null;
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Best effort cleanup.
  }
}
