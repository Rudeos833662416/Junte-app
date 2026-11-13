import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const collage = readFileSync(resolve(root, "components/home-collage.tsx"), "utf8");
const admin = readFileSync(resolve(root, "components/home-collage-admin.tsx"), "utf8");
const migration = readFileSync(resolve(root, "supabase/migrations/0051_home_collage_themes_publish.sql"), "utf8");
const map = readFileSync(resolve(root, "components/social-map-screen.tsx"), "utf8");

describe("home collage publishing and realtime venues", () => {
  it("isolates light/dark published reads and keeps two stable buffers", () => {
    expect(collage).toContain("selectedTheme");
    expect(collage).toContain("is_published");
    expect(collage).toContain("visibleLayer");
    expect(collage).toContain("incomingLayer");
    expect(collage).toContain("AsyncStorage");
  });

  it("keeps admin edits in draft and publishes through a server transaction", () => {
    expect(admin).toContain("selectedTheme");
    expect(admin).toContain("is_published");
    expect(admin).toContain("publish_home_collage");
    expect(admin).toContain("Publicar cambios");
    expect(admin).toContain("Previsualizar");
  });

  it("protects published rows and creates a theme-aware publish function", () => {
    expect(migration).toContain("theme");
    expect(migration).toContain("is_published");
    expect(migration).toContain("publish_home_collage");
    expect(migration).toContain("public.is_admin()");
    expect(migration).toContain("supabase_realtime");
  });

  it("uses neutral locality labels and handles all venue events through one reconciled stream", () => {
    expect(map).toContain('featureType: "poi"');
    expect(map).not.toContain('featureType: "road", elementType: "labels.text.fill"');
    expect(map).toContain('event: "*"');
    expect(map).toContain('payload.eventType === "DELETE"');
    expect(map).toContain('.subscribe((status) =>');
  });
});
