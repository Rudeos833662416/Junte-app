import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const profile = readFileSync(resolve(root, "app/(tabs)/profile.tsx"), "utf8");
const stories = readFileSync(resolve(root, "app/(tabs)/stories.tsx"), "utf8");
const home = readFileSync(resolve(root, "app/(tabs)/index.tsx"), "utf8");
const tabs = readFileSync(resolve(root, "app/(tabs)/_layout.tsx"), "utf8");
const friends = readFileSync(resolve(root, "app/(tabs)/friends.tsx"), "utf8");
const bioMigration = readFileSync(resolve(root, "supabase/migrations/0022_profile_bio_length.sql"), "utf8");

describe("Correcciones críticas solicitadas", () => {
  it("permite biografías de 280 caracteres en UI y base de datos", () => {
    expect(profile).toContain("value.slice(0, 280)");
    expect(profile).toContain("maxLength={280}");
    expect(profile).toContain("nextBio.length > 280");
    expect(bioMigration).toContain("char_length(bio) <= 280");
    expect(bioMigration).toContain("NOTIFY pgrst, 'reload schema'");
  });

  it("renderiza los videos de Estados con expo-video", () => {
    expect(stories).toContain("useVideoPlayer");
    expect(stories).toContain("function StoryVideo");
    expect(stories).toContain('activeStory.media_type === "video"');
    expect(stories).toContain("contentFit=\"contain\"");
  });

  it("mantiene Home simple y usa Inicio en la barra inferior", () => {
    expect(home).toContain("Ver amigos en el mapa");
    expect(home).not.toContain('IconSymbol name="calendar"');
    expect(home).not.toContain(">Online<");
    expect(home).not.toContain("Ubicación automática");
    expect(tabs).toContain('title: "Inicio"');
    expect(tabs).toContain('title: "Eventos"');
    expect(tabs).toContain('name="calendar"');
  });

  it("usa el estado Brindis activo y filas compactas en Amigos", () => {
    expect(friends).toContain("Brindis activo");
    expect(friends).toContain("p-3 rounded-2xl mb-2");
  });
});
