import { useColors } from "@/hooks/use-colors";
import { supabase } from "@/lib/supabase";
import { LinearGradient } from "expo-linear-gradient";
import { Image as ExpoImage } from "expo-image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, StyleSheet, View, useWindowDimensions } from "react-native";
import { useThemeContext } from "@/lib/theme-provider";

type CollageImage = {
  id: string;
  image_url: string;
  alt_text: string;
  sort_order: number;
};

const FADE_MS = 2300;
const HOLD_MS = 6500;
const SLOT_COUNT = 4;

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
            transition={450}
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
  const [activeGroup, setActiveGroup] = useState(0);
  const [loading, setLoading] = useState(true);
  const transition = useRef(new Animated.Value(0)).current;
  const groups = useMemo(() => groupsOfFour(images), [images]);
  const gap = Math.max(4, Math.round(width * 0.012));
  const imageOpacity = colorScheme === "dark" ? 0.25 : 0.13;
  const veil = colorScheme === "dark" ? "rgba(10,10,10,0.12)" : "rgba(255,241,208,0.28)";

  const loadImages = useCallback(async () => {
    const { data, error } = await supabase
      .from("home_collage_images" as never)
      .select("id, image_url, alt_text, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (!error) setImages((data ?? []) as unknown as CollageImage[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadImages();
    const channel = supabase
      .channel("home-collage-images")
      .on("postgres_changes", { event: "*", schema: "public", table: "home_collage_images" }, () => void loadImages())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadImages]);

  useEffect(() => {
    setActiveGroup((current) => (groups.length ? current % groups.length : 0));
  }, [groups.length]);

  useEffect(() => {
    if (groups.length <= 1) return;
    const timer = setInterval(() => {
      transition.setValue(0);
      Animated.timing(transition, {
        toValue: 1,
        duration: FADE_MS,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setActiveGroup((current) => (current + 1) % groups.length);
          transition.setValue(0);
        }
      });
    }, HOLD_MS);
    return () => {
      clearInterval(timer);
      transition.stopAnimation();
    };
  }, [groups.length, transition]);

  if (loading || !groups.length) return null;
  const nextGroup = (activeGroup + 1) % groups.length;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: imageOpacity }]}>
        <CollageLayer images={groups[activeGroup]} opacity={1} gap={gap} />
        {groups.length > 1 ? <CollageLayer images={groups[nextGroup]} opacity={transition} gap={gap} /> : null}
      </View>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: veil }]} />
      <LinearGradient
        pointerEvents="none"
        colors={[colors.background, "transparent"]}
        locations={[0, 0.42]}
        style={styles.topGradient}
      />
      <LinearGradient
        pointerEvents="none"
        colors={["transparent", colors.background]}
        locations={[0.52, 1]}
        style={styles.bottomGradient}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flex: 1, flexDirection: "row", flexWrap: "wrap" },
  tile: { width: "49.3%", height: "49.3%" },
  topGradient: { ...StyleSheet.absoluteFillObject, height: "47%" },
  bottomGradient: { ...StyleSheet.absoluteFillObject, top: "43%", height: "57%" },
});
