import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { distanceInKm, filterMapVenues, formatVenueDistance, venueStatusLabel, type MapVenue } from "../lib/map-venues";

const venues: MapVenue[] = [
  { id: 1, name: "Bar Uno", category: "bar", latitude: 10, longitude: -70, address: null, city: null, admin_photo_url: null, rating: 4.5, opening_hours: "18:00–02:00", status: "open", active_promotion: "2x1" },
  { id: 2, name: "Café Dos", category: "cafe", latitude: 11, longitude: -70, address: null, city: null, admin_photo_url: null, rating: null, opening_hours: null, status: "unknown", active_promotion: null },
];

describe("map venues", () => {
  it("filters only first-party venues by category", () => {
    expect(filterMapVenues(venues, "bar").map((venue) => venue.id)).toEqual([1]);
    expect(filterMapVenues(venues, "all")).toHaveLength(2);
  });
  it("formats useful distances and status labels", () => {
    expect(formatVenueDistance(0.42)).toBe("420 m");
    expect(formatVenueDistance(2.4)).toBe("2.4 km");
    expect(venueStatusLabel("open")).toBe("Abierto ahora");
    expect(distanceInKm({ latitude: 10, longitude: -70 }, { latitude: 11, longitude: -70 })).toBeGreaterThan(100);
  });

  it("keeps the map focused on first-party pins and supports venue deep links", () => {
    const source = readFileSync(resolve(process.cwd(), "components/social-map-screen.tsx"), "utf8");
    expect(source).toContain('showsPointsOfInterest={false}');
    expect(source).toContain('featureType: "poi"');
    expect(source).toContain("VENUE_CATEGORY_LABELS");
    expect(source).toContain("focusVenueId");
    expect(source).toContain("previewCard");
  });
});
