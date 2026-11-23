import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({
  value: null as string | null,
  getItem: vi.fn(async () => storage.value),
  setItem: vi.fn(async (_key: string, value: string) => { storage.value = value; }),
  removeItem: vi.fn(async () => { storage.value = null; }),
}));
const signedUrlRequest = vi.hoisted(() => vi.fn());

vi.mock("@react-native-async-storage/async-storage", () => ({ default: storage }));
vi.mock("@/lib/supabase", () => ({
  supabase: { storage: { from: () => ({ createSignedUrl: signedUrlRequest }) } },
}));

// eslint-disable-next-line import/first
import {
  clearSignedUrlCache,
  getCachedSignedUrl,
  getSignedUrlCacheKey,
  isSignedUrlReusable,
} from "../lib/signed-url-cache";

describe("signed URL cache", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    storage.value = null;
    signedUrlRequest.mockReset();
    await clearSignedUrlCache();
  });

  it("indexes by bucket and path", () => {
    expect(getSignedUrlCacheKey("chat-audio", "user/a.m4a")).toBe("chat-audio:user/a.m4a");
  });

  it("reuses a URL only before the configured freshness window", () => {
    const createdAt = 1_000;
    const expiresAt = 101_000;
    expect(isSignedUrlReusable({ signedUrl: "https://example.test", createdAt, expiresAt }, 80_000)).toBe(true);
    expect(isSignedUrlReusable({ signedUrl: "https://example.test", createdAt, expiresAt }, 82_000)).toBe(false);
    expect(isSignedUrlReusable({ signedUrl: "https://example.test", createdAt, expiresAt }, 101_000)).toBe(false);
  });

  it("uses the actual expiry requested for short and long URLs", async () => {
    signedUrlRequest
      .mockResolvedValueOnce({ data: { signedUrl: "https://short.test" }, error: null })
      .mockResolvedValueOnce({ data: { signedUrl: "https://long.test" }, error: null });
    expect(await getCachedSignedUrl("bucket", "short", 10)).toBe("https://short.test");
    expect(await getCachedSignedUrl("bucket", "long", 3_600)).toBe("https://long.test");
    expect(signedUrlRequest).toHaveBeenCalledTimes(2);
  });

  it("deduplicates concurrent requests for the same object", async () => {
    let resolveRequest!: (value: unknown) => void;
    signedUrlRequest.mockReturnValueOnce(new Promise((resolve) => { resolveRequest = resolve; }));
    const first = getCachedSignedUrl("bucket", "same", 60);
    const second = getCachedSignedUrl("bucket", "same", 60);
    await vi.waitFor(() => expect(signedUrlRequest).toHaveBeenCalledTimes(1));
    resolveRequest({ data: { signedUrl: "https://same.test" }, error: null });
    await expect(Promise.all([first, second])).resolves.toEqual(["https://same.test", "https://same.test"]);
  });

  it("ignores corrupt persisted JSON and rebuilds the cache", async () => {
    storage.value = "not-json";
    signedUrlRequest.mockResolvedValueOnce({ data: { signedUrl: "https://rebuilt.test" }, error: null });
    await expect(getCachedSignedUrl("bucket", "corrupt", 60)).resolves.toBe("https://rebuilt.test");
    expect(signedUrlRequest).toHaveBeenCalledTimes(1);
  });

  it("does not repopulate memory or storage when cleared during a request", async () => {
    let resolveRequest!: (value: unknown) => void;
    signedUrlRequest.mockReturnValueOnce(new Promise((resolve) => { resolveRequest = resolve; }));
    const pending = getCachedSignedUrl("bucket", "cleared", 60);
    await vi.waitFor(() => expect(signedUrlRequest).toHaveBeenCalledTimes(1));
    await clearSignedUrlCache();
    resolveRequest({ data: { signedUrl: "https://stale.test" }, error: null });
    await expect(pending).resolves.toBe("https://stale.test");
    signedUrlRequest.mockResolvedValueOnce({ data: { signedUrl: "https://fresh.test" }, error: null });
    await expect(getCachedSignedUrl("bucket", "cleared", 60)).resolves.toBe("https://fresh.test");
    expect(signedUrlRequest).toHaveBeenCalledTimes(2);
  });
});
