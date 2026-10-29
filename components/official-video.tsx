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
  const [fsControlsVisible, setFsControlsVisible] = useState(true);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [barWidth, setBarWidth] = useState(0);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearHideTimer = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

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
  }, [player]);

  const showFsControls = useCallback(() => {
    setFsControlsVisible(true);
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => setFsControlsVisible(false), 3500);
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
        const max = Number(player.duration ?? 0);
        const next = Math.max(0, current + seconds);
        player.currentTime = max > 0 ? Math.min(next, max) : next;
        setPosition(Number(player.currentTime ?? next));
      } catch {
        // ignore
      }
      if (fullscreen) showFsControls();
    },
    [player, fullscreen, showFsControls],
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
      showFsControls();
    },
    [player, showFsControls],
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

      {!fullscreen ? (
        <>
          <Pressable onPress={toggleMute} hitSlop={18} style={{ position: "absolute", left: 10, bottom: 10, ...cornerBtn }}>
            <MaterialIcons name={muted ? "volume-off" : "volume-up"} size={22} color="#FFFFFF" />
          </Pressable>
          <Pressable onPress={onOpenFullscreen} hitSlop={18} style={{ position: "absolute", right: 10, bottom: 10, ...cornerBtn }}>
            <MaterialIcons name="fullscreen" size={22} color="#FFFFFF" />
          </Pressable>
        </>
      ) : null}

      {fullscreen ? (
        <>
          <Pressable
            onPress={() => {
              if (!fsControlsVisible) showFsControls();
              else togglePlay();
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
                  top: "38%",
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

              <Pressable onPress={() => seekBy(-10)} hitSlop={16} style={{ position: "absolute", left: 28, top: "40%", ...cornerBtn }}>
                <MaterialIcons name="replay-10" size={24} color="#FFFFFF" />
              </Pressable>
              <Pressable onPress={() => seekBy(10)} hitSlop={16} style={{ position: "absolute", right: 28, top: "40%", ...cornerBtn }}>
                <MaterialIcons name="forward-10" size={24} color="#FFFFFF" />
              </Pressable>

              <Pressable onPress={toggleMute} hitSlop={18} style={{ position: "absolute", left: 14, bottom: 52, ...cornerBtn }}>
                <MaterialIcons name={muted ? "volume-off" : "volume-up"} size={22} color="#FFFFFF" />
              </Pressable>

              <View style={{ position: "absolute", left: 14, right: 14, bottom: 16, zIndex: 7 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                  <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 11 }}>{formatTime(position)}</Text>
                  <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 11 }}>{formatTime(duration)}</Text>
                </View>
                <Pressable
                  onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
                  onPress={(e) => {
                    if (barWidth <= 0) return;
                    seekToRatio(e.nativeEvent.locationX / barWidth);
                  }}
                  style={{ height: 28, justifyContent: "center" }}
                >
                  <View style={{ height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.25)", overflow: "hidden" }}>
                    <View style={{ width: `${progress * 100}%`, height: "100%", backgroundColor: "#fff" }} />
                  </View>
                </Pressable>
              </View>
            </>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

export { OfficialVideo };
