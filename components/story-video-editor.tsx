import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  PanResponder,
  Pressable,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useVideoPlayer, VideoView } from "expo-video";
import { MaterialIcons } from "@expo/vector-icons";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";

const MAX_SEGMENT_MS = 90_000;
const MIN_SEGMENT_MS = 1_000;
const THUMB_COUNT = 9;

export type StoryVideoEditorResult = {
  startMs: number;
  endMs: number;
  isMuted: boolean;
  caption: string;
  overlayText: string | null;
};

type Props = {
  visible: boolean;
  uri: string;
  durationMs: number;
  fileSizeBytes?: number;
  initialStartMs?: number;
  initialEndMs?: number;
  autoTrimBanner?: boolean;
  onCancel: () => void;
  onPublish: (result: StoryVideoEditorResult) => void;
};

function formatClock(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function StoryVideoEditor({
  visible,
  uri,
  durationMs,
  fileSizeBytes = 0,
  initialStartMs = 0,
  initialEndMs,
  autoTrimBanner = false,
  onCancel,
  onPublish,
}: Props) {
  const insets = useSafeAreaInsets();
  const { keyboardHeight } = useKeyboardInset();
  const { width } = useWindowDimensions();
  const trackWidth = Math.max(240, width - 48);

  const safeDuration = Math.max(durationMs, MIN_SEGMENT_MS);
  const [startMs, setStartMs] = useState(() => Math.max(0, initialStartMs));
  const [endMs, setEndMs] = useState(() =>
    Math.min(safeDuration, initialEndMs ?? Math.min(safeDuration, MAX_SEGMENT_MS)),
  );
  const [isMuted, setIsMuted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [caption, setCaption] = useState("");
  const [overlayText, setOverlayText] = useState<string | null>(null);
  const [showTextInput, setShowTextInput] = useState(false);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [loadingThumbs, setLoadingThumbs] = useState(false);
  const [showBanner, setShowBanner] = useState(autoTrimBanner);

  const startRef = useRef(startMs);
  const endRef = useRef(endMs);
  startRef.current = startMs;
  endRef.current = endMs;

  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.muted = isMuted;
  });

  useEffect(() => {
    player.muted = isMuted;
  }, [isMuted, player]);

  useEffect(() => {
    if (!visible) return;
    setStartMs(Math.max(0, initialStartMs));
    setEndMs(Math.min(safeDuration, initialEndMs ?? Math.min(safeDuration, MAX_SEGMENT_MS)));
    setShowBanner(autoTrimBanner);
  }, [visible, uri, initialStartMs, initialEndMs, safeDuration, autoTrimBanner]);

  useEffect(() => {
    if (!visible) return;
    try {
      player.currentTime = startMs / 1000;
      if (!paused) player.play();
    } catch {
      /* player not ready */
    }
    const id = setInterval(() => {
      try {
        const t = player.currentTime;
        if (t >= endMs / 1000 - 0.05 || t < startMs / 1000 - 0.05) {
          player.currentTime = startMs / 1000;
          if (!paused) player.play();
        }
      } catch {
        /* ignore */
      }
    }, 200);
    return () => clearInterval(id);
  }, [visible, startMs, endMs, paused, player]);

  useEffect(() => {
    if (!visible || !uri) return;
    let cancelled = false;
    setLoadingThumbs(true);
    (async () => {
      try {
        const optionalModuleName = ["expo", "video-thumbnails"].join("-");
        const VideoThumbnails = await import(optionalModuleName);
        const step = safeDuration / THUMB_COUNT;
        const uris: string[] = [];
        for (let i = 0; i < THUMB_COUNT; i++) {
          const t = Math.min(safeDuration - 50, Math.floor(i * step));
          try {
            const { uri: thumb } = await VideoThumbnails.getThumbnailAsync(uri, {
              time: Math.max(0, t),
              quality: 0.4,
            });
            if (!cancelled) uris.push(thumb);
          } catch {
            if (!cancelled) uris.push("");
          }
        }
        if (!cancelled) setThumbs(uris);
      } catch {
        if (!cancelled) setThumbs(Array.from({ length: THUMB_COUNT }, () => ""));
      } finally {
        if (!cancelled) setLoadingThumbs(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, uri, safeDuration]);

  const segmentMs = Math.max(MIN_SEGMENT_MS, endMs - startMs);
  const estimatedMb = useMemo(() => {
    if (!fileSizeBytes || !safeDuration) return 0;
    return (fileSizeBytes * (segmentMs / safeDuration)) / (1024 * 1024);
  }, [fileSizeBytes, segmentMs, safeDuration]);
  const overSize = estimatedMb > 45;

  const msToX = useCallback((ms: number) => (ms / safeDuration) * trackWidth, [safeDuration, trackWidth]);
  const xToMs = useCallback((x: number) => Math.max(0, Math.min(safeDuration, (x / trackWidth) * safeDuration)), [safeDuration, trackWidth]);

  const leftPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, g) => {
        const next = xToMs(msToX(startRef.current) + g.dx);
        const maxStart = endRef.current - MIN_SEGMENT_MS;
        const minStart = Math.max(0, endRef.current - MAX_SEGMENT_MS);
        setStartMs(Math.min(maxStart, Math.max(minStart, next)));
      },
      onPanResponderRelease: () => {},
    }),
  ).current;

  const rightPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, g) => {
        const next = xToMs(msToX(endRef.current) + g.dx);
        const minEnd = startRef.current + MIN_SEGMENT_MS;
        const maxEnd = Math.min(safeDuration, startRef.current + MAX_SEGMENT_MS);
        setEndMs(Math.max(minEnd, Math.min(maxEnd, next)));
      },
      onPanResponderRelease: () => {},
    }),
  ).current;

  if (!visible) return null;

  const bottomPad = Math.max(insets.bottom, 8) + (keyboardHeight > 0 ? keyboardHeight : 0);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: "#0A0A0A" }}>
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Pressable onPress={onCancel} accessibilityLabel="Cerrar" style={{ padding: 8 }}>
            <MaterialIcons name="close" size={28} color="#FFFFFF" />
          </Pressable>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={() => setShowTextInput((v) => !v)}
              accessibilityLabel="Añadir texto"
              style={{ padding: 8, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.12)" }}
            >
              <Text style={{ color: "#FFF", fontWeight: "800", fontSize: 16 }}>Aa</Text>
            </Pressable>
            <Pressable
              onPress={() => setIsMuted((v) => !v)}
              accessibilityLabel={isMuted ? "Activar audio" : "Silenciar"}
              style={{ padding: 8, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.12)" }}
            >
              <MaterialIcons name={isMuted ? "volume-off" : "volume-up"} size={22} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>

        <Pressable
          style={{ flex: 1, marginVertical: 8, justifyContent: "center" }}
          onPress={() => {
            setPaused((p) => {
              const next = !p;
              try {
                if (next) player.pause();
                else player.play();
              } catch {
                /* */
              }
              return next;
            });
          }}
        >
          <VideoView player={player} style={{ width: "100%", height: "100%" }} contentFit="contain" nativeControls={false} />
          {overlayText ? (
            <View pointerEvents="none" style={{ position: "absolute", left: 24, right: 24, top: "40%", alignItems: "center" }}>
              <Text style={{ color: "#FFFFFF", fontSize: 28, fontWeight: "800", textAlign: "center", textShadowColor: "#000", textShadowRadius: 8 }}>
                {overlayText}
              </Text>
            </View>
          ) : null}
          {paused ? (
            <View style={{ position: "absolute", alignSelf: "center", backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 40, padding: 12 }}>
              <MaterialIcons name="play-arrow" size={40} color="#FFF" />
            </View>
          ) : null}
        </Pressable>

        {showTextInput ? (
          <TextInput
            value={overlayText ?? ""}
            onChangeText={(t) => setOverlayText(t.trim() ? t : null)}
            placeholder="Escribe un texto..."
            placeholderTextColor="#9CA3AF"
            style={{ marginHorizontal: 16, marginBottom: 8, color: "#FFF", backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 }}
          />
        ) : null}

        <View style={{ paddingHorizontal: 24, marginBottom: 8 }}>
          <View style={{ height: 48, borderRadius: 8, overflow: "hidden", flexDirection: "row", backgroundColor: "#1F1F1F" }}>
            {loadingThumbs ? (
              <ActivityIndicator style={{ flex: 1 }} color="#FF6B00" />
            ) : (
              thumbs.map((t, i) =>
                t ? (
                  <Image key={i} source={{ uri: t }} style={{ flex: 1, height: 48 }} resizeMode="cover" />
                ) : (
                  <View key={i} style={{ flex: 1, height: 48, backgroundColor: i % 2 ? "#2A2A2A" : "#222" }} />
                ),
              )
            )}
            <View
              pointerEvents="box-none"
              style={{
                position: "absolute",
                left: msToX(startMs),
                width: Math.max(20, msToX(endMs) - msToX(startMs)),
                top: 0,
                bottom: 0,
                borderWidth: 2,
                borderColor: "#FF6B00",
                backgroundColor: "rgba(255,107,0,0.15)",
              }}
            >
              <View {...leftPan.panHandlers} style={{ position: "absolute", left: -10, top: 0, bottom: 0, width: 20, alignItems: "center", justifyContent: "center" }}>
                <View style={{ width: 6, height: 28, borderRadius: 3, backgroundColor: "#FF6B00" }} />
              </View>
              <View {...rightPan.panHandlers} style={{ position: "absolute", right: -10, top: 0, bottom: 0, width: 20, alignItems: "center", justifyContent: "center" }}>
                <View style={{ width: 6, height: 28, borderRadius: 3, backgroundColor: "#FF6B00" }} />
              </View>
            </View>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
            <Pressable onPress={() => setIsMuted((v) => !v)} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <MaterialIcons name={isMuted ? "volume-off" : "volume-up"} size={18} color="#FFF" />
              <Text style={{ color: "#D1D5DB", fontSize: 13 }}>{isMuted ? "Sin audio" : "Con audio"}</Text>
            </Pressable>
            <Text style={{ color: overSize ? "#F87171" : "#D1D5DB", fontSize: 13 }}>
              {formatClock(segmentMs)} · {estimatedMb > 0 ? `${estimatedMb.toFixed(1)} MB` : "—"}
              {overSize ? " (máx. 45 MB)" : ""}
            </Text>
          </View>
        </View>

        {showBanner ? (
          <Pressable onPress={() => setShowBanner(false)} style={{ marginHorizontal: 16, marginBottom: 8, backgroundColor: "rgba(255,107,0,0.2)", borderRadius: 10, padding: 10 }}>
            <Text style={{ color: "#FFD4B0", fontSize: 13, textAlign: "center" }}>Se recortó el video en los primeros 90 segundos</Text>
          </Pressable>
        ) : null}

        <View style={{ paddingHorizontal: 16, paddingBottom: bottomPad, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <TextInput
            value={caption}
            onChangeText={setCaption}
            placeholder="Añade un comentario..."
            placeholderTextColor="#9CA3AF"
            style={{ flex: 1, color: "#FFF", backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 24, paddingHorizontal: 16, paddingVertical: 12 }}
          />
          <Pressable
            disabled={overSize}
            onPress={() =>
              onPublish({
                startMs,
                endMs,
                isMuted,
                caption: caption.trim(),
                overlayText,
              })
            }
            accessibilityLabel="Publicar estado"
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: overSize ? "#6B7280" : "#FF6B00",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MaterialIcons name="check" size={28} color="#FFF" />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
