import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const home = readFileSync(resolve(root, "app/(tabs)/index.tsx"), "utf8");
const collage = readFileSync(resolve(root, "components/home-collage.tsx"), "utf8");
const admin = readFileSync(resolve(root, "components/home-collage-admin.tsx"), "utf8");
const migration = readFileSync(resolve(root, "supabase/migrations/0047_home_collage.sql"), "utf8");

describe("Home collage", () => {
  it("renders as a decorative, non-interactive layer with theme-aware gradients", () => {
    expect(home).toContain("<HomeCollage");
    expect(collage).toContain('pointerEvents="none"');
    expect(collage).toContain("colors.background");
    expect(collage).toContain("memory-disk");
  });

  it("uses a slow crossfade cadence and cleans Realtime", () => {
    expect(collage).toContain("2300");
    expect(collage).toContain("6500");
    expect(collage).toContain("removeChannel");
  });

  it("protects admin management in both UI contract and database", () => {
    expect(admin).toContain("is_admin");
    expect(admin).toContain("ImagePicker.launchImageLibraryAsync");
    expect(admin).toContain("home-collage");
    expect(migration).toContain("create table if not exists public.home_collage_images");
    expect(migration).toContain("public.is_admin()");
    expect(migration).toContain("supabase_realtime");
  });
});
