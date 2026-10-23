import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/0028_brindar_atomic_map_activity.sql"), "utf8");
const home = readFileSync(resolve(process.cwd(), "app/(tabs)/index.tsx"), "utf8");
const map = readFileSync(resolve(process.cwd(), "components/social-map-screen.tsx"), "utf8");
const helper = readFileSync(resolve(process.cwd(), "lib/friend-checkins.ts"), "utf8");

describe("Brindar y mapa en tiempo real", () => {
  it("usa una RPC atómica para evitar carreras al brindar", () => {
    expect(home).toContain('supabase.rpc("start_my_checkin"');
    expect(migration).toContain("create or replace function public.start_my_checkin");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("status = 'ended'");
  });

  it("muestra marcadores desde un brindis y calcula la zona desde tres", () => {
    expect(migration).toContain("hot_zone_count");
    expect(migration).toContain("having count(b.id) >= 3");
    expect(migration).toContain("'markers', v_markers");
    expect(helper).toContain("hotZoneRadius");
    expect(map).toContain("setFriendMarkers(activity.markers.filter");
  });
});
