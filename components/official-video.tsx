import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, View, Text } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { resolveCachedVideoUri } from "@/lib/video-cache";

type Props = {
  uri: string;
  aspectRatio?: number;
  fullscreen?: boolean;
  isVisible?: boolean;
  onOpenFullscreen: () => void;
};

const HIDE_MS = 2800;

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function OfficialVideo({
  uri,
  aspectRatio = 9 / 16,
  fullscreen = false,
  isVisible = true,
  onOpenFullscreen,
}: Props) {
  const [sourceUri, setSourceUri] = useState(uri);
  const player = useVideoPlayer(sourceUri, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.muted = true;
  });

  const [muted, setMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  /** Controles flotantes / centrales: ocultos por defecto. */
  const [controlsVisible, setControlsVisible] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [barWidth, setBarWidth] = useState(0);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), HIDE_MS);
  }, [clearHideTimer]);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  const hideControls = useCallback(() => {
    clearHideTimer();
    setControlsVisible(false);
  }, [clearHideTimer]);

  /** Tap en el video: muestra controles o los oculta si ya estaban visibles. */
  const handleSurfacePress = useCallback(() => {
    if (controlsVisible) {
      hideControls();
      return;
    }
    revealControls();
  }, [controlsVisible, hideControls, revealControls]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const resolved = await resolveCachedVideoUri(uri);
      if (!cancelled) setSourceUri(resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, [uri]);

  useEffect(() => {
    try {
      player.muted = muted;
    } catch {
      // released
    }
  }, [muted, player]);

  useEffect(() => {
    try {
      if (!isVisible) {
        player.pause();
        player.muted = true;
        setIsPlaying(false);
        setControlsVisible(false);
        clearHideTimer();
        return;
      }
      player.muted = muted;
      player.play();
      setIsPlaying(true);
    } catch {
      // released
    }
  }, [isVisible, fullscreen, player, muted, clearHideTimer]);

  useEffect(() => {
    // Al entrar/salir de fullscreen, controles ocultos de nuevo
    setControlsVisible(false);
    clearHideTimer();
  }, [fullscreen, clearHideTimer]);

  useEffect(() => {
    if (!fullscreen || !isVisible) {
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;
      return;
    }
    tickRef.current = setInterval(() => {
      try {
        setPosition(Number(player.currentTime ?? 0));
        const d = Number(player.duration ?? 0);
        if (d > 0) setDuration(d);
      } catch {
        // ignore
      }
    }, 250);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;
    };
  }, [fullscreen, isVisible, player]);

  useEffect(() => {
    return () => {
      clearHideTimer();
      if (tickRef.current) clearInterval(tickRef.current);
      try {
        player.pause();
        player.muted = true;
      } catch {
        // ignore
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

  const seekBy = useCallback(
    (seconds: number) => {
      try {
        const current = Number(player.currentTime ?? 0);
        const max = Number(player.duration ?? 0);
        const next = Math.max(0, current + seconds);
        player.currentTime = max > 0 ? Math.min(next, max) : next;
        setPosition(Number(player.currentTime ?? next));
      } catch {
        // ignore
      }
      revealControls();
    },
    [player, revealControls],
  );

  const seekToRatio = useCallback(
    (ratio: number) => {
      try {
        const max = Number(player.duration ?? 0);
        if (max <= 0) return;
        const next = Math.max(0, Math.min(1, ratio)) * max;
        player.currentTime = next;
        setPosition(next);
      } catch {
        // ignore
      }
      revealControls();
    },
    [player, revealControls],
  );

  const toggleMute = useCallback(() => {
    setMuted((prev) => !prev);
    revealControls();
  }, [revealControls]);

  const cornerBtn = {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: "rgba(0,0,0,0.55)",
  };

  const progress = duration > 0 ? Math.min(1, position / duration) : 0;

  return (
    <View
      style={{
        width: "100%",
        aspectRatio: aspectRatio > 0 ? aspectRatio : 9 / 16,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#05070C",
        overflow: "hidden",
        borderRadius: fullscreen ? 0 : 12,
      }}
    >
      <VideoView
        player={player}
        style={{ flex: 1, width: "100%" }}
        contentFit="contain"
        nativeControls={false}
        allowsFullscreen={false}
      />

      {/* Capa táctil: aparece / oculta controles */}
      <Pressable
        onPress={handleSurfacePress}
        style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, zIndex: 2 }}
        accessibilityLabel={controlsVisible ? "Ocultar controles" : "Mostrar controles"}
      />

      {/* Inline: mute + fullscreen solo al tocar, esquina inferior */}
      {!fullscreen && controlsVisible ? (
        <>
          <Pressable
            onPress={toggleMute}
            hitSlop={14}
            style={{ position: "absolute", left: 10, bottom: 10, zIndex: 6, ...cornerBtn }}
            accessibilityLabel={muted ? "Activar sonido" : "Silenciar"}
          >
            <MaterialIcons name={muted ? "volume-off" : "volume-up"} size={20} color="#FFFFFF" />
          </Pressable>
          <Pressable
            onPress={() => {
              hideControls();
              onOpenFullscreen();
            }}
            hitSlop={14}
            style={{ position: "absolute", right: 10, bottom: 10, zIndex: 6, ...cornerBtn }}
            accessibilityLabel="Pantalla completa"
          >
            <MaterialIcons name="fullscreen" size={20} color="#FFFFFF" />
          </Pressable>
        </>
      ) : null}

      {/* Fullscreen: controles centrales + barra solo al tocar */}
      {fullscreen && controlsVisible ? (
        <>
          <Pressable
            onPress={togglePlay}
            hitSlop={16}
            style={{
              position: "absolute",
              alignSelf: "center",
              top: "42%",
              marginTop: -28,
              width: 56,
              height: 56,
              borderRadius: 28,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(0,0,0,0.55)",
              zIndex: 6,
            }}
            accessibilityLabel={isPlaying ? "Pausar" : "Reproducir"}
          >
            <MaterialIcons name={isPlaying ? "pause" : "play-arrow"} size={32} color="#FFFFFF" />
          </Pressable>

          <Pressable
            onPress={() => seekBy(-10)}
            hitSlop={14}
            style={{ position: "absolute", left: 36, top: "42%", marginTop: -20, zIndex: 6, ...cornerBtn }}
            accessibilityLabel="Retroceder 10 segundos"
          >
            <MaterialIcons name="replay-10" size={22} color="#FFFFFF" />
          </Pressable>
          <Pressable
            onPress={() => seekBy(10)}
            hitSlop={14}
            style={{ position: "absolute", right: 36, top: "42%", marginTop: -20, zIndex: 6, ...cornerBtn }}
            accessibilityLabel="Adelantar 10 segundos"
          >
            <MaterialIcons name="forward-10" size={22} color="#FFFFFF" />
          </Pressable>

          <Pressable
            onPress={toggleMute}
            hitSlop={14}
            style={{ position: "absolute", left: 12, bottom: 48, zIndex: 6, ...cornerBtn }}
            accessibilityLabel={muted ? "Activar sonido" : "Silenciar"}
          >
            <MaterialIcons name={muted ? "volume-off" : "volume-up"} size={20} color="#FFFFFF" />
          </Pressable>

          <View style={{ position: "absolute", left: 12, right: 12, bottom: 12, zIndex: 7 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
              <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 11 }}>{formatTime(position)}</Text>
              <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 11 }}>{formatTime(duration)}</Text>
            </View>
            <Pressable
              onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
              onPress={(e) => {
                if (barWidth <= 0) return;
                seekToRatio(e.nativeEvent.locationX / barWidth);
              }}
              style={{ height: 24, justifyContent: "center" }}
            >
              <View
                style={{
                  height: 3,
                  borderRadius: 2,
                  backgroundColor: "rgba(255,255,255,0.22)",
                  overflow: "hidden",
                }}
              >
                <View style={{ width: `${progress * 100}%`, height: "100%", backgroundColor: "#fff" }} />
              </View>
            </Pressable>
          </View>
        </>
      ) : null}
    </View>
  );
}

export { OfficialVideo };
