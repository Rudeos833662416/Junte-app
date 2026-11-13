import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { DEFAULT_HOME_COLLAGE_SETTINGS, HomeCollageSettings, normalizeHomeCollageSettings } from "@/lib/home-collage-settings";
import { useThemeContext } from "@/lib/theme-provider";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { Image as ExpoImage } from "expo-image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, StyleSheet, View, useWindowDimensions } from "react-native";

type CollageTheme = "light" | "dark";
type CollageImage = { id: string; image_url: string; alt_text: string; sort_order: number; theme: CollageTheme; is_published: boolean };
const SLOT_COUNT = 4;
const PREVIEW_KEY = "junta2_collage_preview_theme";
const imagesTable = () => supabase.from("home_collage_images" as never) as any;
const settingsTable = () => supabase.from("home_collage_settings" as never) as any;

function groupsOfFour(images: CollageImage[]) {
  if (!images.length) return [];
  const groups: CollageImage[][] = [];
  for (let index = 0; index < images.length; index += SLOT_COUNT) {
    const group = images.slice(index, index + SLOT_COUNT);
    while (group.length < SLOT_COUNT) group.push(images[group.length % images.length]);
    groups.push(group);
  }
  return groups;
}

function CollageLayer({ images, opacity, gap }: { images: CollageImage[]; opacity: Animated.Value | number; gap: number }) {
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity }]}>
    <View style={[styles.grid, { gap }]}>{images.map((image, index) => <ExpoImage key={`${image.id}-${index}`} source={{ uri: image.image_url }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" cachePolicy="memory-disk" contentFit="cover" transition={0} style={styles.tile} />)}</View>
  </Animated.View>;
}

export function HomeCollage() {
  const colors = useColors();
  const { colorScheme } = useThemeContext();
  const { user } = useAuth({ autoFetch: true });
  const { width } = useWindowDimensions();
  const selectedTheme: CollageTheme = colorScheme === "dark" ? "dark" : "light";
  const [images, setImages] = useState<CollageImage[]>([]);
  const [settings, setSettings] = useState<HomeCollageSettings>(DEFAULT_HOME_COLLAGE_SETTINGS);
  const [previewEnabled, setPreviewEnabled] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeGroup, setActiveGroup] = useState(0);
  const [loading, setLoading] = useState(true);
  const transition = useRef(new Animated.Value(0)).current;
  const groupsRef = useRef<CollageImage[][]>([]);
  const generationRef = useRef(0);
  const groups = useMemo(() => groupsOfFour(settings.shuffle_enabled ? [...images].sort((a, b) => a.id.localeCompare(b.id)) : images), [images, settings.shuffle_enabled]);
  const gap = Math.max(4, Math.round(width * 0.012));
  const readMode = previewEnabled && isAdmin ? false : true;
  const effectiveOverlay = colorScheme === "dark" && settings.overlay_color.toUpperCase() === "#FFF1D0" ? "#0A0A0A" : settings.overlay_color;
  const themeVeil = colorScheme === "dark" ? 0.08 : 0.16;
  const brightnessVeil = settings.brightness < 0 ? "#0A0A0A" : "#FFFFFF";
  const brightnessOpacity = Math.abs(settings.brightness) * 0.65;

  const load = useCallback(async () => {
    const [{ data: imageData }, { data: settingsData }] = await Promise.all([
      imagesTable().select("id, image_url, alt_text, sort_order, theme, is_published").eq("theme", selectedTheme).eq("is_published", readMode).eq("is_active", true).order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
      settingsTable().select("image_opacity, brightness, contrast, overlay_color, overlay_opacity, fade_duration_ms, hold_duration_ms, transition_type, shuffle_enabled, autoplay_enabled").eq("theme", selectedTheme).eq("is_published", readMode).maybeSingle(),
    ]);
    setImages((imageData ?? []) as CollageImage[]);
    setSettings(normalizeHomeCollageSettings(settingsData));
    setLoading(false);
  }, [readMode, selectedTheme]);

  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(PREVIEW_KEY).then(async (value) => {
      if (cancelled) return;
      const requested = value === selectedTheme;
      if (!user) { setPreviewEnabled(false); return; }
      const { data } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
      if (!cancelled) { setIsAdmin(Boolean(data?.is_admin)); setPreviewEnabled(requested); }
    });
    return () => { cancelled = true; };
  }, [selectedTheme, user?.id]);

  useEffect(() => {
    void load();
    const channel = supabase.channel(`home-collage-live-${selectedTheme}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "home_collage_images", filter: `theme=eq.${selectedTheme}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "home_collage_settings", filter: `theme=eq.${selectedTheme}` }, () => void load())
      .subscribe();
    return () => { generationRef.current += 1; transition.stopAnimation(); void supabase.removeChannel(channel); };
  }, [load, selectedTheme, transition]);

  useEffect(() => {
    groupsRef.current = groups;
    setActiveGroup((current) => groups.length ? Math.min(current, groups.length - 1) : 0);
  }, [groups]);

  useEffect(() => {
    if (groups.length <= 1 || !settings.autoplay_enabled || settings.transition_type === "instant") return;
    const generation = ++generationRef.current;
    let holdTimer: ReturnType<typeof setTimeout> | undefined;
    let fadeTimer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      holdTimer = setTimeout(() => {
        if (generation !== generationRef.current) return;
        const next = (activeGroup + 1) % groups.length;
        transition.setValue(0);
        Animated.timing(transition, { toValue: 1, duration: Math.max(3000, Math.min(3500, settings.fade_duration_ms)), useNativeDriver: true }).start(({ finished }) => {
          if (!finished || generation !== generationRef.current) return;
          setActiveGroup(next);
          transition.setValue(0);
          fadeTimer = setTimeout(schedule, 0);
        });
      }, settings.hold_duration_ms);
    };
    schedule();
    return () => { generationRef.current += 1; if (holdTimer) clearTimeout(holdTimer); if (fadeTimer) clearTimeout(fadeTimer); transition.stopAnimation(); };
  }, [activeGroup, groups.length, settings.autoplay_enabled, settings.fade_duration_ms, settings.hold_duration_ms, settings.transition_type, transition]);

  if (loading || !groups.length) return null;
  const visibleLayer = groups[activeGroup] ?? groups[0];
  const incomingLayer = groups[(activeGroup + 1) % groups.length] ?? visibleLayer;
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}>
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: settings.image_opacity }]}>
      <CollageLayer images={visibleLayer} opacity={1} gap={gap} />
      {groups.length > 1 && settings.transition_type === "crossfade" ? <CollageLayer images={incomingLayer} opacity={transition} gap={gap} /> : null}
    </View>
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: effectiveOverlay, opacity: Math.min(0.9, settings.overlay_opacity + settings.contrast + themeVeil) }]} />
    {brightnessOpacity > 0 ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: brightnessVeil, opacity: brightnessOpacity }]} /> : null}
    <LinearGradient pointerEvents="none" colors={[colors.background, "transparent"]} locations={[0, 0.42]} style={styles.topGradient} />
    <LinearGradient pointerEvents="none" colors={["transparent", colors.background]} locations={[0.52, 1]} style={styles.bottomGradient} />
  </View>;
}

const styles = StyleSheet.create({ grid: { flex: 1, flexDirection: "row", flexWrap: "wrap" }, tile: { width: "49.3%", height: "49.3%" }, topGradient: { ...StyleSheet.absoluteFillObject, height: "47%" }, bottomGradient: { ...StyleSheet.absoluteFillObject, top: "43%", height: "57%" } });
