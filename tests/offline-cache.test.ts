import { describe, expect, it } from "vitest";
import { getSignedUrlCacheKey, isSignedUrlReusable } from "../lib/signed-url-cache";

describe("signed URL cache", () => {
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
});
