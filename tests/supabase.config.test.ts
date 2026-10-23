import { describe, expect, it } from "vitest";

describe("Supabase configuration", () => {
  it("connects with the configured public credentials", async () => {
    const projectUrl = process.env.SUPABASE_URL ?? "https://cymhbwgxmezrwofkbdqz.supabase.co";
    const anonKey = process.env.SUPABASE_ANON_KEY ?? "sb_publishable_V-Tjv6qV2JaEdXyumlGZ8w_HbdPp7iD";

    expect(projectUrl).toMatch(/^https:\/\/[^\s/]+\.supabase\.co\/?$/);
    expect(anonKey).toBeTruthy();

    const response = await fetch(`${projectUrl}/auth/v1/settings`, {
      headers: {
        apikey: anonKey as string,
        Authorization: `Bearer ${anonKey}`,
      },
    });

    expect(response.ok).toBe(true);
  }, 15_000);
});
