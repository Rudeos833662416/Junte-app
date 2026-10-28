import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

function OfficialVideo({
  uri,
  aspectRatio = 9 / 16,
  fullscreen = false,
  isVisible = true,
  onOpenFullscreen,
}: {
  uri: string;
  aspectRatio?: number;
  fullscreen?: boolean;
  isVisible?: boolean;
  onOpenFullscreen: () => void;
}) {
  // Always start muted to avoid unexpected audio.
  const player = useVideoPlayer(uri, (videoPlayer) => {
    videoPlayer.loop = false;
    videoPlayer.muted = true;
  });
  const [muted, setMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [videoWidth, setVideoWidth] = useState(0);
  const lastTapRef = useRef(0);
  const hideControlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pause + mute when leaving viewport / screen to avoid background audio.
  useEffect(() => {
    if (isVisible && !fullscreen) {
      player.muted = muted;
      player.play();
      setIsPlaying(true);
    } else if (!isVisible) {
      player.pause();
      player.muted = true;
      setIsPlaying(false);
    }
  }, [isVisible, fullscreen, player, muted]);

  // Fullscreen instance owns playback; inline should stay paused when fullscreen is open.
  useEffect(() => {
    if (fullscreen) {
      player.muted = muted;
      player.play();
      setIsPlaying(true);
    }
  }, [fullscreen, player, muted]);

  useEffect(() => {
    return () => {
      try {
        player.pause();
        player.muted = true;
      } catch {
        // player may already be released
      }
      if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    };
  }, [player]);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    if (isPlaying) {
      hideControlsTimerRef.current = setTimeout(() => setControlsVisible(false), 2200);
    }
  }, [isPlaying]);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      player.pause();
      setIsPlaying(false);
    } else {
      player.play();
      setIsPlaying(true);
    }
    revealControls();
  }, [isPlaying, player, revealControls]);

  const seekBy = useCallback(
    (seconds: number) => {
      player.currentTime = Math.max(0, (player.currentTime ?? 0) + seconds);
      revealControls();
    },
    [player, revealControls],
  );

  const handleSurfaceTap = (event: { nativeEvent: { locationX: number } }) => {
    const now = Date.now();
    const delta = now - lastTapRef.current;
    const locationX = event.nativeEvent.locationX;
    lastTapRef.current = now;
    revealControls();
    if (delta < 280 && videoWidth > 0) {
      if (locationX < videoWidth * 0.3) {
        seekBy(-10);
        return;
      }
      if (locationX > videoWidth * 0.7) {
        seekBy(10);
        return;
      }
    }
    if (!fullscreen) togglePlay();
  };

  return (
    <View
      onLayout={(event) => setVideoWidth(event.nativeEvent.layout.width)}
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
      <Pressable style={{ flex: 1, width: "100%" }} onPress={handleSurfaceTap}>
        <VideoView
          player={player}
          style={{ flex: 1, width: "100%" }}
          contentFit="contain"
          nativeControls={false}
          allowsFullscreen={false}
        />
      </Pressable>

      {controlsVisible ? (
        <>
          {/* Bottom-left: play / pause */}
          <Pressable
            onPress={togglePlay}
            hitSlop={12}
            style={{
              position: "absolute",
              left: 12,
              bottom: 12,
              width: 42,
              height: 42,
              borderRadius: 21,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(0,0,0,0.72)",
            }}
          >
            <MaterialIcons name={isPlaying ? "pause" : "play-arrow"} size={24} color="#FFFFFF" />
          </Pressable>

          {/* Bottom-right: mute */}
          <Pressable
            onPress={() => {
              const next = !muted;
              player.muted = next;
              setMuted(next);
              revealControls();
            }}
            hitSlop={12}
            style={{
              position: "absolute",
              right: 12,
              bottom: 12,
              width: 42,
              height: 42,
              borderRadius: 21,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(0,0,0,0.72)",
            }}
          >
            <MaterialIcons name={muted ? "volume-off" : "volume-up"} size={22} color="#FFFFFF" />
          </Pressable>

          {/* Top-right: fullscreen (inline only) */}
          {!fullscreen ? (
            <Pressable
              onPress={onOpenFullscreen}
              hitSlop={12}
              style={{
                position: "absolute",
                right: 12,
                top: 12,
                width: 38,
                height: 38,
                borderRadius: 19,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(0,0,0,0.72)",
              }}
            >
              <MaterialIcons name="fullscreen" size={20} color="#FFFFFF" />
            </Pressable>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

export { OfficialVideo };
