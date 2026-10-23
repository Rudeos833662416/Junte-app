import { describe, expect, it } from "vitest";

describe("Expo account token", () => {
  it("authenticates against the Expo user endpoint", async () => {
    const token = process.env.EXPO_TOKEN;
    expect(token, "EXPO_TOKEN must be configured").toBeTruthy();

    const projectId = "3d49f27e-cc76-40ba-a126-0f549a1d4e08";
    const response = await fetch(`https://api.expo.dev/v2/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.ok, `Expo token rejected with HTTP ${response.status}`).toBe(true);
    const payload = (await response.json()) as { data?: { fullName?: string; accountId?: string } };
    expect(payload.data?.fullName).toBe("@greyradafterglow/socialsip");
    expect(payload.data?.accountId).toBeTruthy();
  }, 20_000);
});
