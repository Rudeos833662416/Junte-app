import { JuntaVideoPlayer } from "@/components/junta-video-player";

type Props = {
  uri: string;
  aspectRatio?: number;
  fullscreen?: boolean;
  isVisible?: boolean;
  onOpenFullscreen: () => void;
  onDoubleTap?: () => void;
};

function OfficialVideo({
  uri,
  aspectRatio = 9 / 16,
  fullscreen = false,
  isVisible = true,
  onOpenFullscreen,
  onDoubleTap,
}: Props) {
  return (
    <JuntaVideoPlayer
      uri={uri}
      variant={fullscreen ? "viewer" : "feed"}
      aspectRatio={aspectRatio > 0 ? aspectRatio : 9 / 16}
      isVisible={isVisible}
      loop={true}
      onOpenFullscreen={fullscreen ? undefined : onOpenFullscreen}
      onDoubleTap={onDoubleTap}
      style={{
        borderRadius: fullscreen ? 0 : 12,
      }}
    />
  );
}

export { OfficialVideo };
