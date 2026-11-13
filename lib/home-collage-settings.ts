export type CollageTransition = "crossfade" | "instant";

export type HomeCollageSettings = {
  image_opacity: number;
  brightness: number;
  contrast: number;
  overlay_color: string;
  overlay_opacity: number;
  fade_duration_ms: number;
  hold_duration_ms: number;
  transition_type: CollageTransition;
  shuffle_enabled: boolean;
  autoplay_enabled: boolean;
};

export const DEFAULT_HOME_COLLAGE_SETTINGS: HomeCollageSettings = {
  image_opacity: 0.16,
  brightness: 0,
  contrast: 0.08,
  overlay_color: "#FFF1D0",
  overlay_opacity: 0.12,
  fade_duration_ms: 2300,
  hold_duration_ms: 6500,
  transition_type: "crossfade",
  shuffle_enabled: false,
  autoplay_enabled: true,
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function normalizeHomeCollageSettings(input?: Partial<HomeCollageSettings> | null): HomeCollageSettings {
  const source = { ...DEFAULT_HOME_COLLAGE_SETTINGS, ...(input ?? {}) };
  const numeric = (value: unknown, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return {
    image_opacity: clamp(numeric(source.image_opacity, DEFAULT_HOME_COLLAGE_SETTINGS.image_opacity), 0, 1),
    brightness: clamp(numeric(source.brightness, 0), -0.35, 0.35),
    contrast: clamp(numeric(source.contrast, 0), 0, 0.5),
    overlay_color: /^#[0-9a-f]{6}$/i.test(source.overlay_color) ? source.overlay_color : DEFAULT_HOME_COLLAGE_SETTINGS.overlay_color,
    overlay_opacity: clamp(numeric(source.overlay_opacity, 0), 0, 0.75),
    fade_duration_ms: clamp(Math.round(numeric(source.fade_duration_ms, 2300)), 800, 5000),
    hold_duration_ms: clamp(Math.round(numeric(source.hold_duration_ms, 6500)), 3000, 30000),
    transition_type: source.transition_type === "instant" ? "instant" : "crossfade",
    shuffle_enabled: Boolean(source.shuffle_enabled),
    autoplay_enabled: source.autoplay_enabled !== false,
  };
}

export const COLLAGE_PRESETS = {
  junta2: { label: "Junta2", overlay_color: "#FFF1D0", overlay_opacity: 0.12, image_opacity: 0.16, brightness: 0, contrast: 0.08 },
  nocturno: { label: "Nocturno", overlay_color: "#0A0A0A", overlay_opacity: 0.28, image_opacity: 0.22, brightness: -0.08, contrast: 0.14 },
  vibrante: { label: "Vibrante", overlay_color: "#FC4C02", overlay_opacity: 0.1, image_opacity: 0.2, brightness: 0.04, contrast: 0.18 },
} as const;
