import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Expo notifications compatibility", () => {
  it("does not schedule a duplicate local banner for the author's own toast", () => {
    const source = readFileSync(resolve(process.cwd(), "app/(tabs)/index.tsx"), "utf8");

    expect(source).not.toMatch(/import\s+\*\s+as\s+Notifications\s+from\s+["']expo-notifications["']/);
    expect(source).toContain('Constants.appOwnership === "expo"');
    expect(source).not.toContain("scheduleNotificationAsync");
    expect(source).toContain("Haptics.notificationAsync");
  });
});
