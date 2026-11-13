import { describe, expect, it } from "vitest";
import { COLLAGE_PRESETS, DEFAULT_HOME_COLLAGE_SETTINGS, normalizeHomeCollageSettings } from "../lib/home-collage-settings";

describe("home collage settings", () => {
  it("normalizes unsafe values while preserving valid settings", () => {
    const settings = normalizeHomeCollageSettings({ image_opacity: 3, fade_duration_ms: 100, overlay_color: "not-a-color", transition_type: "bad" as never });
    expect(settings.image_opacity).toBe(1);
    expect(settings.fade_duration_ms).toBe(800);
    expect(settings.overlay_color).toBe(DEFAULT_HOME_COLLAGE_SETTINGS.overlay_color);
    expect(settings.transition_type).toBe("crossfade");
  });

  it("provides light, dark and vibrant presets", () => {
    expect(COLLAGE_PRESETS.junta2.overlay_color).toBe("#FFF1D0");
    expect(COLLAGE_PRESETS.nocturno.overlay_color).toBe("#0A0A0A");
    expect(COLLAGE_PRESETS.vibrante.overlay_color).toBe("#FC4C02");
  });
});
