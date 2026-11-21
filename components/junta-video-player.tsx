import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { resolveCachedVideoUri } from "@/lib/video-cache";

type Variant = "feed" | "viewer" | "story";

type Props = {
  uri: string;
  variant?: Variant;
  aspectRatio?: number;
  isVisible?: boolean;
  paused?: boolean;
  muted?: boolean;
  loop?: boolean;
  trimStartSec?: number;
  trimEndSec?: number | null;
  playbackRate?: 1 | 1.5 | 2;
  showSpeedButton?: boolean;
  onCycleSpeed?: () => void;
  onOpenFullscreen?: () => void;
  onDoubleTap?: () => void;
  onReady?: () => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  style?: StyleProp<ViewStyle>;
};

const HIDE_MS = 2800;

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function JuntaVideoPlayer({
  uri,
  variant = "feed",
  aspectRatio,
  isVisible = true,
  paused = false,
  muted: controlledMuted,
  loop = true,
  trimStartSec = 0,
  trimEndSec = null,
  playbackRate = 1,
  showSpeedButton = false,
  onCycleSpeed,
  onOpenFullscreen,
  onDoubleTap,
  onReady,
  onTimeUpdate,
  style,
}: Props) {
  const [sourceUri, setSourceUri] = useState(uri);
  const initialMuted = controlledMuted ?? variant === "feed";
  const [internalMuted, setInternalMuted] = useState(initialMuted);
  const effectiveMuted = controlledMuted ?? internalMuted;
  const shouldPlay = isVisible && !paused;

  const player = useVideoPlayer(sourceUri, (videoPlayer) => {
    videoPlayer.loop = loop;
    videoPlayer.muted = initialMuted;
    videoPlayer.timeUpdateEventInterval = 0.1;
  });

  const [isPlaying, setIsPlaying] = useState(shouldPlay);
  const [ready, setReady] = useState(() => uri.startsWith("file://"));
  const [controlsVisible, setControlsVisible] = useState(variant === "viewer");
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [trackWidth, setTrackWidth] = useState(0);

  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<number | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      setControlsVisible(false);
    }, HIDE_MS);
  }, [clearHideTimer]);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  const hideControls = useCallback(() => {
    clearHideTimer();
    setControlsVisible(false);
  }, [clearHideTimer]);

  useEffect(() => {
    let cancelled = false;
    setReady(uri.startsWith("file://"));
    void resolveCachedVideoUri(uri)
      .then((resolved) => {
        if (!cancelled) setSourceUri(resolved);
      })
      .catch(() => {
        if (!cancelled) setSourceUri(uri);
      });
    return () => {
      cancelled = true;
    };
  }, [uri]);

  useEffect(() => {
    try {
      player.loop = loop;
    } catch {
      // released
    }
  }, [loop, player]);

  useEffect(() => {
    try {
      player.muted = effectiveMuted;
    } catch {
      // released
    }
  }, [effectiveMuted, player]);

  useEffect(() => {
    try {
      player.playbackRate = playbackRate;
    } catch {
      // released
    }
  }, [playbackRate, player]);

  useEffect(() => {
    try {
      if (!shouldPlay) {
        player.pause();
        if (!isVisible) player.muted = true;
        setIsPlaying(false);
        if (!isVisible) hideControls();
        return;
      }
      player.muted = effectiveMuted;
      player.play();
      setIsPlaying(true);
    } catch {
      // released
    }
  }, [shouldPlay, isVisible, effectiveMuted, player, hideControls]);

  useEffect(() => {
    const loadSub = player.addListener("sourceLoad", ({ duration: loadedDur }) => {
      if (Number.isFinite(loadedDur) && loadedDur > 0) {
        setDuration(loadedDur);
        if (trimStartSec > 0) {
          try {
            player.currentTime = Math.min(trimStartSec, Math.max(0, loadedDur - 0.05));
          } catch {
            // ignore
          }
        }
      }
    });

    const timeSub = player.addListener("timeUpdate", ({ currentTime }) => {
      const total = Number(player.duration ?? duration);
      if (Number.isFinite(currentTime)) {
        setPosition(currentTime);
        if (total > 0) setDuration(total);
        onTimeUpdate?.(currentTime, total > 0 ? total : 0);
      }
      if (trimEndSec != null && total > 0 && currentTime >= Math.min(trimEndSec, total)) {
        const start = Math.min(trimStartSec, Math.max(0, total - 0.05));
        try {
          player.currentTime = start;
          if (shouldPlay) player.play();
        } catch {
          // ignore
        }
      }
    });

    return () => {
      loadSub.remove();
      timeSub.remove();
    };
  }, [player, trimStartSec, trimEndSec, shouldPlay, duration, onTimeUpdate]);

  useEffect(() => {
    return () => {
      clearHideTimer();
      try {
        player.pause();
        player.muted = true;
      } catch {
        // released
      }
    };
  }, [player, clearHideTimer]);

  const togglePlay = useCallback(() => {
    try {
      if (isPlaying) {
        player.pause();
        setIsPlaying(false);
      } else {
        player.play();
        setIsPlaying(true);
      }
    } catch {
      // ignore
    }
    revealControls();
  }, [isPlaying, player, revealControls]);

  const toggleMute = useCallback(() => {
    if (controlledMuted == null) {
      setInternalMuted((prev) => {
        const next = !prev;
        try {
          player.muted = next;
        } catch {
          // ignore
        }
        return next;
      });
    }
    revealControls();
  }, [controlledMuted, player, revealControls]);

  const handleSeek = useCallback(
    (locationX: number) => {
      const total = Number(player.duration ?? duration);
      if (total <= 0 || trackWidth <= 0) return;
      const ratio = Math.max(0, Math.min(1, locationX / trackWidth));
      const target = ratio * total;
      try {
        player.currentTime = target;
        setPosition(target);
      } catch {
        // ignore
      }
      revealControls();
    },
    [player, duration, trackWidth, revealControls],
  );

  const handleSurfacePress = useCallback(() => {
    const now = Date.now();
    if (onDoubleTap && lastTapRef.current !== null && now - lastTapRef.current <= 280) {
      lastTapRef.current = null;
      onDoubleTap();
      return;
    }
    lastTapRef.current = now;
    if (controlsVisible && variant !== "viewer") {
      hideControls();
    } else {
      revealControls();
    }
  }, [controlsVisible, variant, hideControls, revealControls, onDoubleTap]);

  const progress = duration > 0 ? Math.max(0, Math.min(1, position / duration)) : 0;

  return (
    <View
      style={[
        {
          width: "100%",
          aspectRatio: aspectRatio && aspectRatio > 0 ? aspectRatio : undefined,
          backgroundColor: "#05070C",
          overflow: "hidden",
          justifyContent: "center",
          alignItems: "center",
        },
        style,
      ]}
    >
      <VideoView
        player={player}
        style={{ width: "100%", height: "100%" }}
        contentFit="contain"
        nativeControls={false}
        allowsFullscreen={false}
        onFirstFrameRender={() => {
          setReady(true);
          onReady?.();
        }}
      />

      {!ready ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            inset: 0,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(5, 7, 12, 0.35)",
          }}
        >
          <ActivityIndicator color="#FF6A00" />
        </View>
      ) : null}

      {variant !== "story" ? (
        <Pressable
          onPress={handleSurfacePress}
          style={{ position: "absolute", inset: 0, zIndex: 2 }}
          accessibilityLabel={controlsVisible ? "Ocultar controles de vídeo" : "Mostrar controles de vídeo"}
        />
      ) : null}

      {variant !== "story" && (!isPlaying || controlsVisible) ? (
        <Pressable
          onPress={togglePlay}
          hitSlop={10}
          style={{
            position: "absolute",
            zIndex: 5,
            width: 52,
            height: 52,
            borderRadius: 26,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0, 0, 0, 0.72)",
            borderWidth: 1,
            borderColor: "rgba(255, 106, 0, 0.75)",
          }}
          accessibilityLabel={isPlaying ? "Pausar vídeo" : "Reproducir vídeo"}
        >
          <MaterialIcons name={isPlaying ? "pause" : "play-arrow"} size={28} color="#FFFFFF" />
        </Pressable>
      ) : null}

      {variant !== "story" && controlsVisible ? (
        <View
          style={{
            position: "absolute",
            left: 10,
            right: 10,
            bottom: 10,
            zIndex: 6,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 16,
            backgroundColor: "rgba(0, 0, 0, 0.78)",
          }}
        >
          <Pressable
            onPress={togglePlay}
            hitSlop={8}
            style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" }}
            accessibilityLabel={isPlaying ? "Pausar" : "Reproducir"}
          >
            <MaterialIcons name={isPlaying ? "pause" : "play-arrow"} size={20} color="#FFFFFF" />
          </Pressable>

          <Text style={{ color: "#FFFFFF", fontSize: 11, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
            {formatTime(position)}
          </Text>

          <Pressable
            onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
            onPress={(e) => handleSeek(e.nativeEvent.locationX)}
            style={{ flex: 1, height: 24, justifyContent: "center" }}
            accessibilityLabel="Buscar en el vídeo"
          >
            <View style={{ height: 4, borderRadius: 2, backgroundColor: "rgba(255, 255, 255, 0.28)" }}>
              <View
                style={{
                  width: `${progress * 100}%`,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: "#FF6A00",
                }}
              />
            </View>
          </Pressable>

          <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 11, fontWeight: "600", fontVariant: ["tabular-nums"] }}>
            {formatTime(duration)}
          </Text>

          {controlledMuted == null ? (
            <Pressable
              onPress={toggleMute}
              hitSlop={8}
              style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" }}
              accessibilityLabel={effectiveMuted ? "Activar sonido" : "Silenciar"}
            >
              <MaterialIcons name={effectiveMuted ? "volume-off" : "volume-up"} size={19} color="#FFFFFF" />
            </Pressable>
          ) : null}

          {showSpeedButton && onCycleSpeed ? (
            <Pressable
              onPress={() => {
                onCycleSpeed();
                revealControls();
              }}
              hitSlop={8}
              style={{
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 10,
                backgroundColor: "rgba(255, 106, 0, 0.22)",
                borderWidth: 1,
                borderColor: "rgba(255, 106, 0, 0.65)",
              }}
              accessibilityLabel={`Velocidad ${playbackRate}x`}
            >
              <Text style={{ color: "#FFFFFF", fontSize: 11, fontWeight: "800" }}>{playbackRate}x</Text>
            </Pressable>
          ) : null}

          {onOpenFullscreen ? (
            <Pressable
              onPress={() => {
                hideControls();
                onOpenFullscreen();
              }}
              hitSlop={8}
              style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" }}
              accessibilityLabel="Pantalla completa"
            >
              <MaterialIcons name="fullscreen" size={20} color="#FFFFFF" />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
