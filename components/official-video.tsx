import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

type Props = {
  uri: string;
  aspectRatio?: number;
  fullscreen?: boolean;
  isVisible?: boolean;
  onOpenFullscreen: () => void;
};

/**
 * Feed: autoplay muted + loop. Controles fijos: mute (izq) y fullscreen (der).
 * Fullscreen: play/pause, seek ±10s, mute. Cierre: atrás del sistema (sin X).
 */
function OfficialVideo({
  uri,
  aspectRatio = 9 / 16,
  fullscreen = false,
  isVisible = true,
  onOpenFullscreen,
}: Props) {
  const player = useVideoPlayer(uri, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.muted = true;
  });

  const [muted, setMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [fsControlsVisible, setFsControlsVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimer = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

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
        return;
      }
      player.muted = muted;
      player.play();
      setIsPlaying(true);
    } catch {
      // released
    }
  }, [isVisible, fullscreen, player, muted]);

  useEffect(() => {
    return () => {
      clearHideTimer();
      try {
        player.pause();
        player.muted = true;
      } catch {
        // ignore
      }
    };
  }, [player]);

  const showFsControls = useCallback(() => {
    setFsControlsVisible(true);
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => setFsControlsVisible(false), 2800);
  }, []);

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
    if (fullscreen) showFsControls();
  }, [isPlaying, player, fullscreen, showFsControls]);

  const seekBy = useCallback(
    (seconds: number) => {
      try {
        const current = Number(player.currentTime ?? 0);
        player.currentTime = Math.max(0, current + seconds);
      } catch {
        // ignore
      }
      if (fullscreen) showFsControls();
    },
    [player, fullscreen, showFsControls],
  );

  const toggleMute = useCallback(() => {
    setMuted((prev) => !prev);
    if (fullscreen) showFsControls();
  }, [fullscreen, showFsControls]);

  const cornerBtn = {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: "rgba(0,0,0,0.78)",
    zIndex: 6,
  };

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

      {/* FEED: mute (izq) + fullscreen (der), siempre visibles */}
      {!fullscreen ? (
        <>
          <Pressable
            onPress={toggleMute}
            hitSlop={18}
            accessibilityRole="button"
            accessibilityLabel={muted ? "Activar sonido" : "Silenciar"}
            style={{ position: "absolute", left: 10, bottom: 10, ...cornerBtn }}
          >
            <MaterialIcons name={muted ? "volume-off" : "volume-up"} size={22} color="#FFFFFF" />
          </Pressable>
          <Pressable
            onPress={onOpenFullscreen}
            hitSlop={18}
            accessibilityRole="button"
            accessibilityLabel="Pantalla completa"
            style={{ position: "absolute", right: 10, bottom: 10, ...cornerBtn }}
          >
            <MaterialIcons name="fullscreen" size={22} color="#FFFFFF" />
          </Pressable>
        </>
      ) : null}

      {/* FULLSCREEN: controles de reproducción */}
      {fullscreen ? (
        <>
          <Pressable
            onPress={() => {
              if (!fsControlsVisible) {
                showFsControls();
              } else {
                togglePlay();
              }
            }}
            style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, zIndex: 2 }}
          />

          {fsControlsVisible ? (
            <>
              <Pressable
                onPress={togglePlay}
                hitSlop={20}
                style={{
                  position: "absolute",
                  alignSelf: "center",
                  top: "40%",
                  width: 60,
                  height: 60,
                  borderRadius: 30,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(0,0,0,0.72)",
                  zIndex: 6,
                }}
              >
                <MaterialIcons name={isPlaying ? "pause" : "play-arrow"} size={34} color="#FFFFFF" />
              </Pressable>

              <Pressable
                onPress={() => seekBy(-10)}
                hitSlop={16}
                style={{
                  position: "absolute",
                  left: 28,
                  top: "42%",
                  ...cornerBtn,
                }}
              >
                <MaterialIcons name="replay-10" size={24} color="#FFFFFF" />
              </Pressable>

              <Pressable
                onPress={() => seekBy(10)}
                hitSlop={16}
                style={{
                  position: "absolute",
                  right: 28,
                  top: "42%",
                  ...cornerBtn,
                }}
              >
                <MaterialIcons name="forward-10" size={24} color="#FFFFFF" />
              </Pressable>

              <Pressable
                onPress={toggleMute}
                hitSlop={18}
                style={{ position: "absolute", left: 14, bottom: 32, ...cornerBtn }}
              >
                <MaterialIcons name={muted ? "volume-off" : "volume-up"} size={22} color="#FFFFFF" />
              </Pressable>
            </>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

export { OfficialVideo };
