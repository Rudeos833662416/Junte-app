import { describe, expect, it } from "vitest";

describe("Google Maps configuration", () => {
  it("accepts the configured API key at the Maps endpoint", async () => {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    expect(apiKey).toBeTruthy();

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey as string)}&loading=async`,
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body.length).toBeGreaterThan(0);
    expect(body).not.toContain("The provided API key is invalid");
  }, 15_000);
});
