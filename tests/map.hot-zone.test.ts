import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const mapSource = readFileSync(resolve(process.cwd(), "components/social-map-screen.tsx"), "utf8");
const helperSource = readFileSync(resolve(process.cwd(), "lib/friend-checkins.ts"), "utf8");
const migrationSource = readFileSync(resolve(process.cwd(), "supabase/migrations/0026_map_hot_zone_privacy.sql"), "utf8");

describe("Mapa: zona caliente y privacidad", () => {
  it("pinta una zona roja con radio dinámico y contador anónimo", () => {
    expect(mapSource).toContain("<Circle");
    expect(mapSource).toContain("hotZoneRadius");
    expect(mapSource).toContain("hotZoneCount} Brindis");
    expect(mapSource).toContain("fillColor=\"rgba(239, 68, 68, 0.18)\"");
  });

  it("consume actividad agregada en vez de exponer check-ins privados", () => {
    expect(helperSource).toContain('supabase.rpc("get_map_activity")');
    expect(migrationSource).toContain("coalesce(p.is_public, false) = true");
    expect(migrationSource).toContain("f.status = 'accepted'");
    expect(migrationSource).toContain("'total_count'");
    expect(migrationSource).toContain("round(avg(v.latitude)::numeric, 3)");
  });
});
