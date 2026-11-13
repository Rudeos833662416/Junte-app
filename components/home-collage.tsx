import { useColors } from "@/hooks/use-colors";
import { supabase } from "@/lib/supabase";
import { DEFAULT_HOME_COLLAGE_SETTINGS, HomeCollageSettings, normalizeHomeCollageSettings } from "@/lib/home-collage-settings";
import { useThemeContext } from "@/lib/theme-provider";
import { LinearGradient } from "expo-linear-gradient";
import { Image as ExpoImage } from "expo-image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, StyleSheet, View, useWindowDimensions } from "react-native";

type CollageImage = { id: string; image_url: string; alt_text: string; sort_order: number };
const SLOT_COUNT = 4;
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
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity }]}>
      <View style={[styles.grid, { gap }]}>
        {images.map((image, index) => (
          <ExpoImage
            key={`${image.id}-${index}`}
            source={{ uri: image.image_url }}
            accessibilityLabel={image.alt_text}
            cachePolicy="memory-disk"
            contentFit="cover"
            transition={350}
            style={styles.tile}
          />
        ))}
      </View>
    </Animated.View>
  );
}

export function HomeCollage() {
  const colors = useColors();
  const { colorScheme } = useThemeContext();
  const { width } = useWindowDimensions();
  const [images, setImages] = useState<CollageImage[]>([]);
  const [settings, setSettings] = useState<HomeCollageSettings>(DEFAULT_HOME_COLLAGE_SETTINGS);
  const [activeGroup, setActiveGroup] = useState(0);
  const [loading, setLoading] = useState(true);
  const transition = useRef(new Animated.Value(0)).current;
  const groups = useMemo(() => {
    const source = settings.shuffle_enabled ? [...images].sort((a, b) => a.id.localeCompare(b.id)) : images;
    return groupsOfFour(source);
  }, [images, settings.shuffle_enabled]);
  const gap = Math.max(4, Math.round(width * 0.012));
  const effectiveOverlay = colorScheme === "dark" && settings.overlay_color.toUpperCase() === "#FFF1D0" ? "#0A0A0A" : settings.overlay_color;
  const themeVeil = colorScheme === "dark" ? 0.08 : 0.16;
  const brightnessVeil = settings.brightness < 0 ? "#0A0A0A" : "#FFFFFF";
  const brightnessOpacity = Math.abs(settings.brightness) * 0.65;

  const load = useCallback(async () => {
    const [{ data: imageData }, { data: settingsData }] = await Promise.all([
      imagesTable().select("id, image_url, alt_text, sort_order").eq("is_active", true).order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
      settingsTable().select("image_opacity, brightness, contrast, overlay_color, overlay_opacity, fade_duration_ms, hold_duration_ms, transition_type, shuffle_enabled, autoplay_enabled").eq("id", true).maybeSingle(),
    ]);
    setImages((imageData ?? []) as CollageImage[]);
    setSettings(normalizeHomeCollageSettings(settingsData));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel("home-collage-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "home_collage_images" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "home_collage_settings" }, () => void load())
      .subscribe();
    return () => void supabase.removeChannel(channel);
  }, [load]);

  useEffect(() => {
    setActiveGroup((current) => (groups.length ? current % groups.length : 0));
  }, [groups.length]);

  useEffect(() => {
    if (groups.length <= 1 || !settings.autoplay_enabled) return;
    const timer = setInterval(() => {
      transition.setValue(0);
      if (settings.transition_type === "instant") {
        setActiveGroup((current) => (current + 1) % groups.length);
        return;
      }
      Animated.timing(transition, { toValue: 1, duration: settings.fade_duration_ms, useNativeDriver: true }).start(({ finished }) => {
        if (finished) {
          setActiveGroup((current) => (current + 1) % groups.length);
          transition.setValue(0);
        }
      });
    }, settings.hold_duration_ms);
    return () => {
      clearInterval(timer);
      transition.stopAnimation();
    };
  }, [groups.length, settings.autoplay_enabled, settings.fade_duration_ms, settings.hold_duration_ms, settings.transition_type, transition]);

  if (loading || !groups.length) return null;
  const nextGroup = (activeGroup + 1) % groups.length;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: settings.image_opacity }]}>
        <CollageLayer images={groups[activeGroup]} opacity={1} gap={gap} />
        {groups.length > 1 && settings.transition_type === "crossfade" ? <CollageLayer images={groups[nextGroup]} opacity={transition} gap={gap} /> : null}
      </View>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: effectiveOverlay, opacity: Math.min(0.9, settings.overlay_opacity + settings.contrast + themeVeil) }]} />
      {brightnessOpacity > 0 ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: brightnessVeil, opacity: brightnessOpacity }]} /> : null}
      <LinearGradient pointerEvents="none" colors={[colors.background, "transparent"]} locations={[0, 0.42]} style={styles.topGradient} />
      <LinearGradient pointerEvents="none" colors={["transparent", colors.background]} locations={[0.52, 1]} style={styles.bottomGradient} />
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flex: 1, flexDirection: "row", flexWrap: "wrap" },
  tile: { width: "49.3%", height: "49.3%" },
  topGradient: { ...StyleSheet.absoluteFillObject, height: "47%" },
  bottomGradient: { ...StyleSheet.absoluteFillObject, top: "43%", height: "57%" },
});
