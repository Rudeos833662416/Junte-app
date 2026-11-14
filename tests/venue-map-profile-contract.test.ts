import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeMapVenue, venueCategoryIcon } from "../lib/map-venues";

const root = process.cwd();
const mapSource = readFileSync(resolve(root, "components/social-map-screen.tsx"), "utf8");
const profileSource = readFileSync(resolve(root, "components/events-screen.tsx"), "utf8");

describe("venue map and profile contract", () => {
  it("normalizes admin coordinates without changing their precision", () => {
    const venue = normalizeMapVenue({ id: 9, name: "Club", latitude: "10.4801234", longitude: "-66.9012345", category: "club" });
    expect(venue?.latitude).toBe(10.4801234);
    expect(venue?.longitude).toBe(-66.9012345);
    expect(venue?.category).toBe("club");
  });

  it("chooses a distinct first-party pin icon for each admin category", () => {
    expect(venueCategoryIcon("bar")).toBe("local-bar");
    expect(venueCategoryIcon("club")).toBe("nightlife");
    expect(venueCategoryIcon("event")).toBe("event");
    expect(venueCategoryIcon("cafe")).toBe("local-cafe");
    expect(venueCategoryIcon("restaurant")).toBe("restaurant");
  });

  it("keeps the venue preview as the only map navigation action in the profile", () => {
    expect(profileSource).toContain("Abrir mapa centrado →");
    expect(profileSource).not.toContain(">Ubicar en el mapa</Text>");
    expect(profileSource).not.toContain(">Hacer Check-in</Text>");
    expect(profileSource).not.toContain("Hacer check-in en este local");
  });

  it("does not recolor natural road and locality labels", () => {
    const styleSource = mapSource.slice(mapSource.indexOf("const CLEAN_MAP_STYLE"), mapSource.indexOf("function venueColor"));
    expect(styleSource).not.toContain("labels.text.fill");
    expect(styleSource).not.toContain("labels.text.stroke");
    expect(mapSource).toContain('featureType: "poi"');
    expect(mapSource).toContain('showsPointsOfInterest={false}');
  });

  it("keeps custom venue pins renderable on Android and exposes pull-to-refresh feedback", () => {
    expect(mapSource).toContain("tracksViewChanges={true}");
    expect(mapSource).toContain("PanResponder.create");
    expect(mapSource).toContain("onPanResponderRelease");
    expect(mapSource).toContain('.subscribe((status) =>');
  });

  it("clears focus params when the venue preview is dismissed", () => {
    expect(mapSource).toContain("dismissVenuePreview");
    expect(mapSource).toContain("router.setParams");
    expect(mapSource).toContain("focusVenueId: undefined");
  });
});
