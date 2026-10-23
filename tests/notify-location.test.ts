import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "supabase/functions/notify-activity/index.ts"), "utf8");

describe("notificaciones de ubicación", () => {
  it("consulta el venue y distingue lugares comerciales de zonas residenciales", () => {
    expect(source).toContain("getVenueContext");
    expect(source).toContain("GOOGLE_PLACES_API_KEY");
    expect(source).toContain("nominatim.openstreetmap.org/reverse");
    expect(source).toContain("está tomando algo en");
    expect(source).toContain("está tomando algo cerca de");
  });

  it("no envía la dirección exacta residencial", () => {
    expect(source).toContain("neighborhoodFromAddress");
    expect(source).toContain("return `${actorName} está tomando algo cerca de ${context.neighborhood");
    expect(source).toContain("GENERIC_LOCATION_NAMES");
  });

  it("mantiene las acciones rápidas y la misma función de webhook", () => {
    expect(source).toContain("BRINDAR_HEALTH");
    expect(source).toContain("BRINDAR_ON_WAY");
    expect(source).toContain("Deno.serve");
  });
});
