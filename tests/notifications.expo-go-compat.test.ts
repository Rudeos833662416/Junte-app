import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Expo notifications compatibility", () => {
  it("loads notifications lazily only for native builds outside Expo Go", () => {
    const source = readFileSync(resolve(process.cwd(), "app/(tabs)/index.tsx"), "utf8");

    expect(source).not.toMatch(/import\s+\*\s+as\s+Notifications\s+from\s+["']expo-notifications["']/);
    expect(source).toContain('Constants.appOwnership === "expo"');
    expect(source).toContain('await import("expo-notifications")');
    expect(source).toContain('Platform.OS !== "web" && !isExpoGo');
  });
});
