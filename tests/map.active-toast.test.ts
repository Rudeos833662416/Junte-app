import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const indexSource = readFileSync(resolve(process.cwd(), "app/(tabs)/index.tsx"), "utf8");
const mapSource = readFileSync(resolve(process.cwd(), "components/social-map-screen.tsx"), "utf8");
const eventsSource = readFileSync(resolve(process.cwd(), "app/(tabs)/events.tsx"), "utf8");
const sqlSource = readFileSync(resolve(process.cwd(), "supabase/migrations/0028_brindar_atomic_map_activity.sql"), "utf8");

describe("Brindis activo y clustering", () => {
  it("registra TTL de 30 minutos y permite cancelación propia", () => {
    expect(indexSource).toContain('supabase.rpc("start_my_checkin"');
    expect(sqlSource).toContain("30 minutes");
    expect(indexSource).toContain("deactivate_my_checkin");
    expect(sqlSource).toContain("interval '30 minutes'");
    expect(sqlSource).toContain("start_my_checkin");
  });

  it("exige un mínimo de tres brindis dentro de 50 metros", () => {
    expect(sqlSource).toContain("having count(b.id) >= 3");
    expect(sqlSource).toContain("<= 50");
    expect(mapSource).toContain("setHotZoneRadius(activity.hotZoneRadius)");
  });

  it("permite pausa, doble toque y salto de diez segundos", () => {
    expect(eventsSource).toContain("delta < 280");
    expect(eventsSource).toContain("direction * 10");
    expect(eventsSource).toContain("setControlsVisible(false)");
  });
});
