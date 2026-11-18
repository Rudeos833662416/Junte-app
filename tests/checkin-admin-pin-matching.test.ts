import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/0059_checkin_admin_pin_matching.sql", "utf8");

describe("check-in admin pin matching", () => {
  it("busca solo pines propios y usa un radio de 35 metros", () => {
    expect(migration).toContain("coalesce(v.source, 'admin') <> 'device'");
    expect(migration).toContain("find_pin_at_toast(p_lat, p_lng, 35)");
    expect(migration).toContain("distance_meters <= greatest(coalesce(p_radius_meters, 35), 1)");
  });

  it("no vuelve a crear Ubicación GPS actual y permite ausencia de venue", () => {
    expect(migration).toContain("alter column venue_id drop not null");
    expect(migration).not.toContain("'Ubicación GPS actual'");
    expect(migration).toContain("'cerca de tu zona'");
  });
});
