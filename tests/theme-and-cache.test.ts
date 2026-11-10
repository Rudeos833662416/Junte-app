import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("tema, legibilidad y caché", () => {
  it("persiste el modo elegido y useColors respeta la preferencia", () => {
    const provider = readFileSync(resolve(root, "lib/theme-provider.tsx"), "utf8");
    const colors = readFileSync(resolve(root, "hooks/use-colors.ts"), "utf8");
    expect(provider).toContain("THEME_PREFERENCE_KEY");
    expect(provider).toContain("AsyncStorage.setItem");
    expect(colors).toContain("useThemeContext");
  });

  it("define un color legible sobre el naranja de marca", () => {
    const theme = readFileSync(resolve(root, "theme.config.js"), "utf8");
    expect(theme).toContain("onPrimary");
    expect(theme).toContain("#17120E");
  });

  it("usa caché persistente para fotos, portadas y estados", () => {
    const profile = readFileSync(resolve(root, "app/(tabs)/profile.tsx"), "utf8");
    const stories = readFileSync(resolve(root, "app/(tabs)/stories.tsx"), "utf8");
    const friends = readFileSync(resolve(root, "app/(tabs)/friends.tsx"), "utf8");
    expect(profile).toContain('cachePolicy="memory-disk"');
    expect(stories).not.toContain('cachePolicy="none"');
    expect(friends).not.toContain('cachePolicy="none"');
  });
});
