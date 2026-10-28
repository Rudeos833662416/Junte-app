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
  const player = useVideoPlayer(uri, (videoPlayer) => {
    videoPlayer.loop = false;
  });
  const [muted, setMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(isVisible);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [videoWidth, setVideoWidth] = useState(0);
  const lastTapRef = useRef(0);
  const hideControlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isVisible) {
      player.play();
      setIsPlaying(true);
    } else {
      player.pause();
      setIsPlaying(false);
    }
  }, [isVisible, player]);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    if (isPlaying) {
      hideControlsTimerRef.current = setTimeout(() => setControlsVisible(false), 1800);
    }
  }, [isPlaying]);

  useEffect(
    () => () => {
      if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    },
    [],
  );

  const handleSurfaceTap = (event: { nativeEvent: { locationX: number } }) => {
    const now = Date.now();
    const delta = now - lastTapRef.current;
    const locationX = event.nativeEvent.locationX;
    lastTapRef.current = now;
    revealControls();
    if (delta < 280 && videoWidth > 0 && (locationX < videoWidth * 0.3 || locationX > videoWidth * 0.7)) {
      const direction = locationX < videoWidth * 0.3 ? -1 : 1;
      player.currentTime = Math.max(0, player.currentTime + direction * 10);
      return;
    }
    if (fullscreen) return;
    if (isPlaying) player.pause();
    else player.play();
    setIsPlaying((current) => !current);
  };

  return (
    <View
      onLayout={(event) => setVideoWidth(event.nativeEvent.layout.width)}
      style={{ width: "100%", aspectRatio, alignItems: "center", justifyContent: "center", backgroundColor: "#05070C" }}
    >
      <Pressable style={{ flex: 1, width: "100%" }} onPress={handleSurfaceTap}>
        <VideoView
          player={player}
          style={{ flex: 1, width: "100%" }}
          contentFit="contain"
          nativeControls={fullscreen}
          allowsFullscreen={fullscreen}
        />
      </Pressable>
      {controlsVisible ? (
        <>
          {!fullscreen ? (
            <Pressable
              onPress={onOpenFullscreen}
              style={{
                position: "absolute",
                right: 58,
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
          <Pressable
            onPress={() => {
              const next = !muted;
              player.muted = next;
              setMuted(next);
              revealControls();
            }}
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
            <MaterialIcons name={muted ? "volume-off" : "volume-up"} size={20} color="#FFFFFF" />
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

export { OfficialVideo };
