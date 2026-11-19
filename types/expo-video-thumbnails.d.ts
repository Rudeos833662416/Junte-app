declare module "expo-video-thumbnails" {
  export type ThumbnailOptions = {
    time?: number;
    quality?: number;
  };

  export function getThumbnailAsync(
    sourceFilename: string,
    options?: ThumbnailOptions,
  ): Promise<{ uri: string; width: number; height: number }>; 
}
